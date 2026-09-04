const DB_URL = "https://sjl-fleet-triptyque-default-rtdb.firebaseio.com";

let currentUser = null;
let currentPark = 'TFZ';
let currentStock = {
  barres_ok: 0,
  barres_nok: 0,
  cinchas_ok: 0,
  cinchas_nok: 0,
  cantoneras_ok: 0,
  cantoneras_nok: 0
};
let movementsList = [];
let lastShiftData = null;

// ==================== 1. RBAC & AUTH PERMISSIONS ====================
function checkAuthAndPermissions() {
  const sessionStr = localStorage.getItem('sjl_user') || sessionStorage.getItem('sjl_user');
  
  if (!sessionStr) {
    // Redirect to login if user arrived unauthenticated
    window.location.href = "index.html";
    return;
  }

  currentUser = JSON.parse(sessionStr);

  const badgeName = document.getElementById('invUserBadgeName');
  const badgeRole = document.getElementById('invUserBadgeRole');
  if (badgeName) badgeName.innerText = currentUser.username || "Agent";
  if (badgeRole) badgeRole.innerText = currentUser.role || "POMPISTE";

  // Restrict Pompistes & Yard Workers:
  // Cannot export full excel database, cannot access main customs port engine
  const isRestrictedWorker = (currentUser.role === 'PARK_AGENT' || currentUser.role === 'POMPISTE' || currentUser.role === 'DRIVER');

  if (isRestrictedWorker) {
    const exportBtn = document.getElementById('btnExportInv');
    if (exportBtn) exportBtn.classList.add('hidden');

    const navHubBtn = document.getElementById('btnNavMainHub');
    if (navHubBtn) navHubBtn.classList.add('hidden');
  }
}

function logoutInventory() {
  localStorage.removeItem('sjl_user');
  sessionStorage.removeItem('sjl_user');
  window.location.href = "index.html";
}

// ==================== 2. PARK SELECTOR ====================
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

// ==================== 3. MODAL CONTROLS ====================
function openTransactionModal(type) {
  const modal = document.getElementById('transactionModal');
  const title = document.getElementById('transModalTitle');
  const icon = document.getElementById('transModalIcon');
  document.getElementById('transType').value = type;
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

function openShiftModal() {
  const modal = document.getElementById('shiftModal');
  document.getElementById('shiftForm').reset();

  const now = new Date();
  document.getElementById('shiftDate').value = now.toISOString().split('T')[0];
  document.getElementById('shiftBarresOk').value = currentStock.barres_ok || 0;
  document.getElementById('shiftCinchasOk').value = currentStock.cinchas_ok || 0;
  document.getElementById('shiftCantonerasOk').value = currentStock.cantoneras_ok || 0;

  modal.classList.remove('hidden');
}

function closeShiftModal() {
  document.getElementById('shiftModal').classList.add('hidden');
}

// ==================== 4. DATA ENGINE ====================
async function loadParkData() {
  try {
    const movRes = await fetch(`${DB_URL}/inventory/${currentPark}/movements.json`);
    const movData = await movRes.json();
    movementsList = [];
    if (movData) {
      Object.keys(movData).forEach(key => {
        movementsList.push({ id: key, ...movData[key] });
      });
    }

    const shiftRes = await fetch(`${DB_URL}/inventory/${currentPark}/last_shift.json`);
    lastShiftData = await shiftRes.json();

    recalculateLiveStock();
    renderMovementsTable();
  } catch (err) {
    console.error("Error loading inventory:", err);
  }
}

function recalculateLiveStock() {
  let totals = {
    barres_ok: lastShiftData ? (parseInt(lastShiftData.barresOk) || 0) : 0,
    barres_nok: 0,
    cinchas_ok: lastShiftData ? (parseInt(lastShiftData.cinchasOk) || 0) : 0,
    cinchas_nok: 0,
    cantoneras_ok: lastShiftData ? (parseInt(lastShiftData.cantonerasOk) || 0) : 0,
    cantoneras_nok: 0
  };

  movementsList.forEach(item => {
    const factor = item.type === 'ENTREE' ? 1 : -1;
    totals.barres_ok += (parseInt(item.barresOk) || 0) * factor;
    totals.barres_nok += (parseInt(item.barresNok) || 0) * factor;
    totals.cinchas_ok += (parseInt(item.cinchasOk) || 0) * factor;
    totals.cinchas_nok += (parseInt(item.cinchasNok) || 0) * factor;
    totals.cantoneras_ok += (parseInt(item.cantonerasOk) || 0) * factor;
    totals.cantoneras_nok += (parseInt(item.cantonerasNok) || 0) * factor;
  });

  currentStock = {
    barres_ok: Math.max(0, totals.barres_ok),
    barres_nok: Math.max(0, totals.barres_nok),
    cinchas_ok: Math.max(0, totals.cinchas_ok),
    cinchas_nok: Math.max(0, totals.cinchas_nok),
    cantoneras_ok: Math.max(0, totals.cantoneras_ok),
    cantoneras_nok: Math.max(0, totals.cantoneras_nok)
  };

  fetch(`${DB_URL}/inventory/${currentPark}/stock.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(currentStock)
  });

  updateKPIDisplay();
}

function updateKPIDisplay() {
  document.getElementById('kpiBarresOk').innerText = currentStock.barres_ok || 0;
  document.getElementById('kpiBarresNok').innerText = currentStock.barres_nok || 0;

  document.getElementById('kpiCinchasOk').innerText = currentStock.cinchas_ok || 0;
  document.getElementById('kpiCinchasNok').innerText = currentStock.cinchas_nok || 0;

  document.getElementById('kpiCantonerasOk').innerText = currentStock.cantoneras_ok || 0;
  document.getElementById('kpiCantonerasNok').innerText = currentStock.cantoneras_nok || 0;

  if (lastShiftData) {
    document.getElementById('kpiLastShift').innerText = `${lastShiftData.date} • ${lastShiftData.heure}`;
    document.getElementById('kpiLastShiftAgents').innerText = `${lastShiftData.agent1} ➔ ${lastShiftData.agent2}`;
  } else {
    document.getElementById('kpiLastShift').innerText = "Aucun shift";
    document.getElementById('kpiLastShiftAgents').innerText = "Agents: -";
  }
}

// ==================== 5. TRANSACTIONS & HANDOVER ====================
async function saveTransaction(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSaveTrans');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement...`;

  const payload = {
    date: document.getElementById('transDate').value,
    heure: document.getElementById('transTime').value,
    type: document.getElementById('transType').value,
    matricule: document.getElementById('transMatricule').value.trim().toUpperCase(),
    chauffeur: document.getElementById('transChauffeur').value.trim().toUpperCase(),
    barresOk: parseInt(document.getElementById('countBarresOk').value) || 0,
    barresNok: parseInt(document.getElementById('countBarresNok').value) || 0,
    cinchasOk: parseInt(document.getElementById('countCinchasOk').value) || 0,
    cinchasNok: parseInt(document.getElementById('countCinchasNok').value) || 0,
    cantonerasOk: parseInt(document.getElementById('countCantonerasOk').value) || 0,
    cantonerasNok: parseInt(document.getElementById('countCantonerasNok').value) || 0,
    comment: document.getElementById('transComment').value.trim() || "-",
    timestamp: new Date().toISOString()
  };

  try {
    const res = await fetch(`${DB_URL}/inventory/${currentPark}/movements.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    payload.id = data.name;
    movementsList.push(payload);

    recalculateLiveStock();
    renderMovementsTable();
    closeTransactionModal();
  } catch (err) {
    alert("Erreur lors de l'enregistrement: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> <span>Valider et Enregistrer</span>`;
  }
}

async function saveShiftHandover(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSaveShift');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Validation...`;

  const bOk = parseInt(document.getElementById('shiftBarresOk').value) || 0;
  const cOk = parseInt(document.getElementById('shiftCinchasOk').value) || 0;
  const cantOk = parseInt(document.getElementById('shiftCantonerasOk').value) || 0;

  const shiftData = {
    date: document.getElementById('shiftDate').value,
    heure: document.getElementById('shiftHeure').value,
    agent1: document.getElementById('shiftAgent1').value.trim().toUpperCase(),
    agent2: document.getElementById('shiftAgent2').value.trim().toUpperCase(),
    barresOk: bOk,
    cinchasOk: cOk,
    cantonerasOk: cantOk,
    timestamp: new Date().toISOString()
  };

  try {
    await fetch(`${DB_URL}/inventory/${currentPark}/shifts.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(shiftData)
    });

    await fetch(`${DB_URL}/inventory/${currentPark}/last_shift.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(shiftData)
    });

    lastShiftData = shiftData;
    recalculateLiveStock();
    closeShiftModal();
    alert("Passation de shift enregistrée avec succès !");
  } catch (err) {
    alert("Erreur: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-check-double"></i> <span>Valider la Passation</span>`;
  }
}

async function deleteMovement(id) {
  // Permission Guard: Only Supervisor can delete
  if (!currentUser || currentUser.role !== 'SUPERVISOR') {
    alert("Action réservée aux Superviseurs.");
    return;
  }

  if (!confirm("Voulez-vous supprimer ce mouvement ? Le stock sera automatiquement recalculé.")) return;
  try {
    await fetch(`${DB_URL}/inventory/${currentPark}/movements/${id}.json`, { 
      method: "DELETE" 
    });

    movementsList = movementsList.filter(m => m.id !== id);
    recalculateLiveStock();
    renderMovementsTable();
  } catch (err) {
    alert("Erreur lors de la suppression: " + err.message);
  }
}

// ==================== 6. TABLE RENDER WITH PERMISSION GUARDS ====================
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

  filtered.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-slate-500">Aucun mouvement pour ce parc.</td></tr>`;
    return;
  }

  const isSupervisor = currentUser && currentUser.role === 'SUPERVISOR';

  filtered.forEach(row => {
    const isEntree = row.type === 'ENTREE';
    const typeBadge = isEntree ? 
      `<span class="bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold">🟢 ENTRÉE</span>` :
      `<span class="bg-rose-950 text-rose-300 border border-rose-800 px-2 py-0.5 rounded text-[10px] font-bold">🔴 SORTIE</span>`;

    const barresDisplay = (row.barresOk || row.barresNok) ? 
      `<span class="text-white font-bold">${row.barresOk || 0}</span> / <span class="text-rose-400 font-bold">${row.barresNok || 0}</span>` : `-`;

    const cinchasDisplay = (row.cinchasOk || row.cinchasNok) ? 
      `<span class="text-white font-bold">${row.cinchasOk || 0}</span> / <span class="text-rose-400 font-bold">${row.cinchasNok || 0}</span>` : `-`;

    const cantonerasDisplay = (row.cantonerasOk || row.cantonerasNok) ? 
      `<span class="text-white font-bold">${row.cantonerasOk || 0}</span> / <span class="text-rose-400 font-bold">${row.cantonerasNok || 0}</span>` : `-`;

    // Only Supervisors see the trash can button
    const actionCell = isSupervisor
      ? `<button onclick="deleteMovement('${row.id}')" class="text-slate-500 hover:text-rose-400 p-1" title="Supprimer"><i class="fa-solid fa-trash-can"></i></button>`
      : `<span class="text-[10px] text-slate-600 font-medium">Verrouillé</span>`;

    tbody.innerHTML += `
      <tr class="hover:bg-slate-700/40">
        <td class="py-2.5 px-3 whitespace-nowrap text-slate-400">${row.date} <span class="text-slate-200 font-semibold">${row.heure}</span></td>
        <td class="py-2.5 px-3">${typeBadge}</td>
        <td class="py-2.5 px-3 font-bold text-yellow-400">${row.matricule}</td>
        <td class="py-2.5 px-3 text-slate-200 uppercase">${row.chauffeur}</td>
        <td class="py-2.5 px-2 text-center">${barresDisplay}</td>
        <td class="py-2.5 px-2 text-center">${cinchasDisplay}</td>
        <td class="py-2.5 px-2 text-center">${cantonerasDisplay}</td>
        <td class="py-2.5 px-3 text-slate-300 italic text-[11px]">${row.comment}</td>
        <td class="py-2.5 px-3 text-right">${actionCell}</td>
      </tr>
    `;
  });
}

function exportInventoryExcel() {
  if (movementsList.length === 0) {
    alert("Aucune donnée à exporter !");
    return;
  }

  const exportData = movementsList.map(item => ({
    "PARC": currentPark,
    "DATE": item.date,
    "HEURE": item.heure,
    "SENS": item.type,
    "MATRICULE": item.matricule,
    "CHAUFFEUR": item.chauffeur,
    "BARRES OK": item.barresOk || 0,
    "BARRES NOK": item.barresNok || 0,
    "CINCHAS OK": item.cinchasOk || 0,
    "CINCHAS NOK": item.cinchasNok || 0,
    "CANTONERAS OK": item.cantonerasOk || 0,
    "CANTONERAS NOK": item.cantonerasNok || 0,
    "OBSERVATIONS / BON": item.comment
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `SJL_${currentPark}_Equipment`);
  XLSX.writeFile(wb, `SJL_${currentPark}_Equipment_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// Initial Boot with RBAC Check
checkAuthAndPermissions();
loadParkData();
setInterval(loadParkData, 10000);