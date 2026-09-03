// FIREBASE REALTIME DATABASE URL (Matching your existing DB)
const DB_URL = "https://sjl-fleet-triptyque-default-rtdb.firebaseio.com";

let currentPark = 'TFZ'; // Default park
let currentStock = {
  sangles_ok: 0,
  sangles_nok: 0,
  barres_ok: 0,
  barres_nok: 0,
  stackability: 0,
  barres_frigo: 0,
  tapis: 0
};
let movementsList = [];
let lastShiftData = null;

// Switch Park between TFZ and CASA
function switchPark(park) {
  currentPark = park;
  document.getElementById('ledgerParkTitle').innerText = `PARC ${park}`;

  const btnTFZ = document.getElementById('btnParkTFZ');
  const btnCASA = document.getElementById('btnParkCASA');

  if (park === 'TFZ') {
    btnTFZ.className = "px-5 py-2 rounded-lg text-xs font-bold transition bg-amber-600 text-white shadow";
    btnCASA.className = "px-5 py-2 rounded-lg text-xs font-bold transition text-slate-400 hover:text-white";
  } else {
    btnCASA.className = "px-5 py-2 rounded-lg text-xs font-bold transition bg-amber-600 text-white shadow";
    btnTFZ.className = "px-5 py-2 rounded-lg text-xs font-bold transition text-slate-400 hover:text-white";
  }

  loadParkData();
}

// Transaction Modal Open/Close
function openTransactionModal(type) {
  const modal = document.getElementById('transactionModal');
  const title = document.getElementById('transModalTitle');
  const icon = document.getElementById('transModalIcon');
  const typeField = document.getElementById('transType');

  typeField.value = type;
  document.getElementById('transactionForm').reset();

  const now = new Date();
  document.getElementById('transDate').value = now.toISOString().split('T')[0];
  document.getElementById('transTime').value = now.toTimeString().slice(0, 5);

  if (type === 'ENTREE') {
    title.innerText = `Enregistrer une ENTRÉE (${currentPark})`;
    icon.className = "fa-solid fa-circle-arrow-down text-emerald-400 text-lg";
  } else {
    title.innerText = `Enregistrer une SORTIE (${currentPark})`;
    icon.className = "fa-solid fa-circle-arrow-up text-rose-400 text-lg";
  }

  modal.classList.remove('hidden');
}

function closeTransactionModal() {
  document.getElementById('transactionModal').classList.add('hidden');
}

// Shift Modal Open/Close
function openShiftModal() {
  const modal = document.getElementById('shiftModal');
  document.getElementById('shiftForm').reset();

  const now = new Date();
  document.getElementById('shiftDate').value = now.toISOString().split('T')[0];

  // Pre-fill with current stock
  document.getElementById('shiftSangles').value = currentStock.sangles_ok;
  document.getElementById('shiftBarres').value = currentStock.barres_ok;
  document.getElementById('shiftStackability').value = currentStock.stackability;
  document.getElementById('shiftFrigo').value = currentStock.barres_frigo || 4;

  modal.classList.remove('hidden');
}

function closeShiftModal() {
  document.getElementById('shiftModal').classList.add('hidden');
}

// 1. LOAD PARK DATA FROM FIREBASE
async function loadParkData() {
  try {
    // Fetch current stock
    const stockRes = await fetch(`${DB_URL}/inventory/${currentPark}/stock.json`);
    const stockData = await stockRes.json();
    if (stockData) {
      currentStock = stockData;
    } else {
      currentStock = { sangles_ok: 0, sangles_nok: 0, barres_ok: 0, barres_nok: 0, stackability: 0, barres_frigo: 0, tapis: 0 };
    }

    // Fetch movements
    const movRes = await fetch(`${DB_URL}/inventory/${currentPark}/movements.json`);
    const movData = await movRes.json();
    movementsList = [];
    if (movData) {
      Object.keys(movData).forEach(key => {
        movementsList.push({ id: key, ...movData[key] });
      });
    }

    // Fetch last shift
    const shiftRes = await fetch(`${DB_URL}/inventory/${currentPark}/last_shift.json`);
    lastShiftData = await shiftRes.json();

    updateKPIDisplay();
    renderMovementsTable();
  } catch (err) {
    console.error("Error loading inventory data:", err);
  }
}

// 2. UPDATE KPI SUMMARY CARDS
function updateKPIDisplay() {
  document.getElementById('kpiSanglesOk').innerText = currentStock.sangles_ok || 0;
  document.getElementById('kpiSanglesNok').innerText = `NOK: ${currentStock.sangles_nok || 0}`;

  document.getElementById('kpiBarresOk').innerText = currentStock.barres_ok || 0;
  document.getElementById('kpiBarresNok').innerText = `NOK: ${currentStock.barres_nok || 0}`;

  document.getElementById('kpiStackability').innerText = currentStock.stackability || 0;
  document.getElementById('kpiBarresFrigo').innerText = currentStock.barres_frigo || 0;
  document.getElementById('kpiTapis').innerText = currentStock.tapis || 0;

  if (lastShiftData) {
    document.getElementById('kpiLastShift').innerText = `${lastShiftData.date} • ${lastShiftData.heure}`;
    document.getElementById('kpiLastShiftAgents').innerText = `${lastShiftData.agent1} ➔ ${lastShiftData.agent2}`;
  } else {
    document.getElementById('kpiLastShift').innerText = "Aucun shift";
    document.getElementById('kpiLastShiftAgents').innerText = "Agents: -";
  }
}

// 3. SAVE A TRANSACTION (ENTREE OR SORTIE)
async function saveTransaction(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSaveTrans');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement...`;

  const type = document.getElementById('transType').value;
  const bOk = parseInt(document.getElementById('countBarresOk').value) || 0;
  const stack = parseInt(document.getElementById('countStackability').value) || 0;
  const sOk = parseInt(document.getElementById('countSanglesOk').value) || 0;
  const tap = parseInt(document.getElementById('countTapis').value) || 0;

  const payload = {
    date: document.getElementById('transDate').value,
    heure: document.getElementById('transTime').value,
    type: type, // 'ENTREE' or 'SORTIE'
    matricule: document.getElementById('transMatricule').value.trim().toUpperCase(),
    chauffeur: document.getElementById('transChauffeur').value.trim().toUpperCase(),
    barresOk: bOk,
    stackability: stack,
    sanglesOk: sOk,
    tapis: tap,
    comment: document.getElementById('transComment').value.trim() || "-",
    timestamp: new Date().toISOString()
  };

  try {
    // 1. Post to movements log
    await fetch(`${DB_URL}/inventory/${currentPark}/movements.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    // 2. Adjust live stock (+ if ENTREE, - if SORTIE)
    const factor = type === 'ENTREE' ? 1 : -1;
    currentStock.barres_ok = Math.max(0, (currentStock.barres_ok || 0) + (bOk * factor));
    currentStock.stackability = Math.max(0, (currentStock.stackability || 0) + (stack * factor));
    currentStock.sangles_ok = Math.max(0, (currentStock.sangles_ok || 0) + (sOk * factor));
    currentStock.tapis = Math.max(0, (currentStock.tapis || 0) + (tap * factor));

    // 3. Update stock in Firebase
    await fetch(`${DB_URL}/inventory/${currentPark}/stock.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentStock)
    });

    closeTransactionModal();
    await loadParkData();
  } catch (err) {
    alert("Erreur lors de l'enregistrement: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> <span>Valider et Enregistrer</span>`;
  }
}

// 4. SAVE SHIFT HANDOVER (PASSATION DE SHIFT 3x8)
async function saveShiftHandover(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSaveShift');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Validation...`;

  const sCount = parseInt(document.getElementById('shiftSangles').value) || 0;
  const bCount = parseInt(document.getElementById('shiftBarres').value) || 0;
  const stackCount = parseInt(document.getElementById('shiftStackability').value) || 0;
  const frigoCount = parseInt(document.getElementById('shiftFrigo').value) || 0;

  const shiftData = {
    date: document.getElementById('shiftDate').value,
    heure: document.getElementById('shiftHeure').value,
    agent1: document.getElementById('shiftAgent1').value.trim().toUpperCase(),
    agent2: document.getElementById('shiftAgent2').value.trim().toUpperCase(),
    sangles: sCount,
    barres: bCount,
    stackability: stackCount,
    frigo: frigoCount,
    timestamp: new Date().toISOString()
  };

  try {
    // 1. Record in shift history
    await fetch(`${DB_URL}/inventory/${currentPark}/shifts.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(shiftData)
    });

    // 2. Set as last shift
    await fetch(`${DB_URL}/inventory/${currentPark}/last_shift.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(shiftData)
    });

    // 3. Sync the physical inventory counts directly to the active stock
    currentStock.sangles_ok = sCount;
    currentStock.barres_ok = bCount;
    currentStock.stackability = stackCount;
    currentStock.barres_frigo = frigoCount;

    await fetch(`${DB_URL}/inventory/${currentPark}/stock.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentStock)
    });

    closeShiftModal();
    alert("Passation de shift enregistrée et stock mis à jour !");
    await loadParkData();
  } catch (err) {
    alert("Erreur lors de la passation: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-check-double"></i> <span>Valider la Passation</span>`;
  }
}

// 5. DELETE A TRANSACTION
async function deleteMovement(id) {
  if (!confirm("Voulez-vous vraiment supprimer cet enregistrement ?")) return;
  try {
    await fetch(`${DB_URL}/inventory/${currentPark}/movements/${id}.json`, { method: "DELETE" });
    await loadParkData();
  } catch (err) {
    alert("Erreur: " + err.message);
  }
}

// 6. RENDER MOVEMENTS AUDIT TABLE
function renderMovementsTable() {
  const tbody = document.getElementById('movementsTableBody');
  const search = (document.getElementById('filterSearch').value || '').toLowerCase();
  const filterType = document.getElementById('filterType').value;

  tbody.innerHTML = '';

  let filtered = movementsList.filter(item => {
    const matchSearch = (item.matricule && item.matricule.toLowerCase().includes(search)) ||
                        (item.chauffeur && item.chauffeur.toLowerCase().includes(search)) ||
                        (item.comment && item.comment.toLowerCase().includes(search));
    const matchType = filterType === 'ALL' || item.type === filterType;
    return matchSearch && matchType;
  });

  // Sort by newest first
  filtered.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-6 text-slate-500">Aucun mouvement enregistré pour ce parc.</td></tr>`;
    return;
  }

  filtered.forEach(row => {
    const isEntree = row.type === 'ENTREE';
    const typeBadge = isEntree ? 
      `<span class="bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold">🟢 ENTRÉE</span>` :
      `<span class="bg-rose-950 text-rose-300 border border-rose-800 px-2 py-0.5 rounded text-[10px] font-bold">🔴 SORTIE</span>`;

    tbody.innerHTML += `
      <tr class="hover:bg-slate-700/40">
        <td class="py-2.5 px-3 whitespace-nowrap text-slate-400">${row.date} <span class="text-slate-200 font-semibold">${row.heure}</span></td>
        <td class="py-2.5 px-3">${typeBadge}</td>
        <td class="py-2.5 px-3 font-bold text-yellow-400">${row.matricule}</td>
        <td class="py-2.5 px-3 text-slate-200 uppercase">${row.chauffeur}</td>
        <td class="py-2.5 px-2 text-center font-bold ${row.barresOk > 0 ? 'text-blue-400' : 'text-slate-600'}">${row.barresOk || '-'}</td>
        <td class="py-2.5 px-2 text-center font-bold ${row.stackability > 0 ? 'text-amber-400' : 'text-slate-600'}">${row.stackability || '-'}</td>
        <td class="py-2.5 px-2 text-center font-bold ${row.sanglesOk > 0 ? 'text-emerald-400' : 'text-slate-600'}">${row.sanglesOk || '-'}</td>
        <td class="py-2.5 px-2 text-center font-bold ${row.tapis > 0 ? 'text-violet-400' : 'text-slate-600'}">${row.tapis || '-'}</td>
        <td class="py-2.5 px-3 text-slate-300 italic text-[11px]">${row.comment}</td>
        <td class="py-2.5 px-3 text-right">
          <button onclick="deleteMovement('${row.id}')" title="Supprimer" class="text-slate-500 hover:text-rose-400 p-1">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      </tr>
    `;
  });
}

// 7. EXPORT TO EXCEL
function exportInventoryExcel() {
  if (movementsList.length === 0) {
    alert("Aucune donnée à exporter pour ce parc !");
    return;
  }

  const exportData = movementsList.map(item => ({
    "PARC": currentPark,
    "DATE": item.date,
    "HEURE": item.heure,
    "SENS": item.type,
    "MATRICULE": item.matricule,
    "CHAUFFEUR": item.chauffeur,
    "BARRES OK": item.barresOk,
    "STACKABILITY": item.stackability,
    "SANGLES OK": item.sanglesOk,
    "TAPIS": item.tapis,
    "OBSERVATIONS": item.comment
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `SJL_Stock_${currentPark}`);
  XLSX.writeFile(wb, `SJL_Stock_${currentPark}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// Initial Run
loadParkData();
setInterval(loadParkData, 10000); // Live poll every 10s