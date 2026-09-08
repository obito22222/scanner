// ==========================================
// IMPORT AUTOMATIQUE EXCEL PORT TANGER MED
// ==========================================
function handleExcelImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = async function(e) {
    try {
      // 1. Resolve Firebase Database instance dynamically
      let rtdb = null;
      if (typeof db !== "undefined" && db && typeof db.ref === "function") {
        rtdb = db;
      } else if (typeof database !== "undefined" && database && typeof database.ref === "function") {
        rtdb = database;
      } else if (typeof firebase !== "undefined" && firebase.database) {
        rtdb = firebase.database();
      }

      if (!rtdb) {
        throw new Error("Impossible de trouver l'instance Firebase (db/database non initialisé).");
      }

      // 2. Read Excel binary content
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });

      // Automatically target the latest day/sheet (last tab, e.g. '08-09')
      const targetSheetName = workbook.SheetNames[workbook.SheetNames.length - 1];
      const worksheet = workbook.Sheets[targetSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

      if (!rows || rows.length === 0) {
        alert(`La feuille [${targetSheetName}] est vide.`);
        return;
      }

      // 3. Find the header row dynamically (where 'matricule' is written)
      let headerRowIndex = rows.findIndex(r => 
        Array.isArray(r) && r.some(cell => String(cell).toLowerCase().includes("matricule"))
      );
      if (headerRowIndex === -1) headerRowIndex = 1;

      const importUpdates = {};
      let count = 0;

      // Helper to cleanly format dates as YYYY-MM-DD
      const parseExcelDate = (val) => {
        if (!val) return "";
        if (val instanceof Date) {
          const y = val.getFullYear();
          const m = String(val.getMonth() + 1).padStart(2, '0');
          const d = String(val.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
        const str = String(val).trim();
        return str.split(" ")[0]; // Strip time component if present
      };

      // 4. Parse trailer entries
      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;

        const rawMatricule = row[1]; // Col B: Matricule
        if (!rawMatricule || String(rawMatricule).trim().length < 3) continue;

        // Clean key for Firebase path
        const cleanKey = String(rawMatricule).trim().toUpperCase().replace(/[\s-]/g, "");

        const dateArrivee = parseExcelDate(row[4]); // Col E: Date d'arrivée Port
        const dateSortie  = parseExcelDate(row[8]); // Col I: Date de sortie

        importUpdates[`port_trailers/${cleanKey}`] = {
          matricule: String(rawMatricule).trim().toUpperCase(),
          cleanKey: cleanKey,
          client: row[2] ? String(row[2]).trim() : "-",
          transitaire: row[3] ? String(row[3]).trim() : "-",
          arriveePort: dateArrivee,
          etatDedouanement: row[5] ? String(row[5]).trim() : "En attente",
          chauffeur: row[6] ? String(row[6]).trim() : "-",
          sortiePort: dateSortie,
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

      // 5. Update Firebase
      if (count > 0) {
        await rtdb.ref().update(importUpdates);
        alert(`Synchronisation réussie !\n${count} remorques importées depuis l'onglet [${targetSheetName}].`);
      } else {
        alert(`Aucune remorque trouvée dans la feuille [${targetSheetName}].`);
      }

    } catch (err) {
      console.error("Erreur import Excel:", err);
      alert("Erreur lors de l'import: " + err.message);
    }
  };

  reader.readAsArrayBuffer(file);
  event.target.value = ""; // Reset input so re-uploading the same file triggers onchange
}