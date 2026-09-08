// ==========================================
// IMPORT AUTOMATIQUE EXCEL PORT TANGER MED
// ==========================================
async function handleExcelImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  // 1. Detect Firebase Database instance safely
  let rtdb = null;
  try {
    if (typeof database !== "undefined" && database && typeof database.ref === "function") {
      rtdb = database;
    } else if (typeof db !== "undefined" && db && typeof db.ref === "function") {
      rtdb = db;
    } else if (window.database && typeof window.database.ref === "function") {
      rtdb = window.database;
    } else if (window.db && typeof window.db.ref === "function") {
      rtdb = window.db;
    } else if (typeof firebase !== "undefined" && firebase.database) {
      rtdb = firebase.database();
    }
  } catch (err) {
    console.warn("Detection standard échouée:", err);
  }

  if (!rtdb) {
    alert("Erreur: Impossible de se connecter à la base de données Firebase. Vérifiez l'initialisation dans app.js.");
    event.target.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = async function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });

      // Pick the last sheet (most recent day tab, e.g. '08-09')
      const targetSheetName = workbook.SheetNames[workbook.SheetNames.length - 1];
      const worksheet = workbook.Sheets[targetSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

      if (!rows || rows.length === 0) {
        alert(`La feuille [${targetSheetName}] est vide.`);
        return;
      }

      // Locate header row containing 'Matricule'
      let headerRowIndex = rows.findIndex(r => 
        Array.isArray(r) && r.some(cell => String(cell).toLowerCase().includes("matricule"))
      );
      if (headerRowIndex === -1) headerRowIndex = 1;

      const importUpdates = {};
      let count = 0;

      const parseExcelDate = (val) => {
        if (!val) return "";
        if (val instanceof Date) {
          const y = val.getFullYear();
          const m = String(val.getMonth() + 1).padStart(2, '0');
          const d = String(val.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
        return String(val).trim().split(" ")[0];
      };

      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;

        const rawMatricule = row[1]; // Col B: Matricule
        if (!rawMatricule || String(rawMatricule).trim().length < 3) continue;

        const cleanKey = String(rawMatricule).trim().toUpperCase().replace(/[\s-]/g, "");

        importUpdates[`port_trailers/${cleanKey}`] = {
          matricule: String(rawMatricule).trim().toUpperCase(),
          cleanKey: cleanKey,
          client: row[2] ? String(row[2]).trim() : "-",
          transitaire: row[3] ? String(row[3]).trim() : "-",
          arriveePort: parseExcelDate(row[4]),
          etatDedouanement: row[5] ? String(row[5]).trim() : "En attente",
          chauffeur: row[6] ? String(row[6]).trim() : "-",
          sortiePort: parseExcelDate(row[8]),
          bad: row[11] ? String(row[11]).trim() : "-",
          pli: row[12] ? String(row[12]).trim() : "-",
          eur1: row[13] ? String(row[13]).trim() : "-",
          cg: row[14] ? String(row[14]).trim() : "-",
          assur: row[15] ? String(row[15]).trim() : "-",
          vt: row[16] ? String(row[16]).trim() : "-",
          sourceSheet: targetSheetName,
          lastUpdated: new Date().toISOString()
        };

        count++;
      }

      if (count > 0) {
        await rtdb.ref().update(importUpdates);
        alert(`Synchronisation réussie !\n${count} remorques importées depuis l'onglet [${targetSheetName}].`);
      } else {
        alert(`Aucune remorque valide trouvée dans la feuille [${targetSheetName}].`);
      }

    } catch (err) {
      console.error("Erreur import:", err);
      alert("Erreur lors de la lecture du fichier Excel: " + err.message);
    }
  };

  reader.readAsArrayBuffer(file);
  event.target.value = "";
}