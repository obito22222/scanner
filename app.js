const DB_URL = "https://sjl-fleet-triptyque-default-rtdb.firebaseio.com";

let currentUser = null;
let rawList = [];
let allUsers = [];

// Clean key for Firebase paths
function sanitizeKey(key) {
  return (key || "").replace(/[.#$\[\]\/]/g, "_").trim();
}

// ==================== 1. AUTHENTICATION & LOGIN ====================
async function handleLogin(e) {
  e.preventDefault();
  const rawUser = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const cleanUser = sanitizeKey(rawUser);
  const errorDiv = document.getElementById('authError');
  const btn = document.getElementById('loginBtn');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Connexion...`;
  }
  if (errorDiv) errorDiv.classList.add('hidden');

  try {
    const res = await fetch(`${DB_URL}/users/${cleanUser}.json`);
    const user = await res.json();

    if (!user || user.password !== password) {
      if (errorDiv) {
        errorDiv.innerText = "Identifiant ou mot de passe incorrect.";
        errorDiv.classList.remove('hidden');
      }
      return;
    }

    // Save session
    currentUser = { username: cleanUser, role: user.role };
    localStorage.setItem('sjl_user', JSON.stringify(currentUser));

    // Direct routing: Pompistes go straight to the inventory ledger
    if (user.role === 'PARK_AGENT') {
      window.location.href = "inventory.html";
      return;
    }

    // Other roles: Hide auth screen and render workspace
    document.getElementById('authScreen').classList.add('hidden');
    updateUserBadge();
    applyRolePermissions();
    await fetchTrailers();
    render();

  } catch (err) {
    if (errorDiv) {
      errorDiv.innerText = "Erreur de connexion : " + err.message;
      errorDiv.classList.remove('hidden');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>Se connecter</span> <i class="fa-solid fa-arrow-right"></i>`;
    }
  }
}

function checkExistingSession() {
  const sessionStr = localStorage.getItem('sjl_user') || sessionStorage.getItem('sjl_user');
  if (sessionStr) {
    currentUser = JSON.parse(sessionStr);

    if (currentUser.role === 'PARK_AGENT') {
      window.location.href = "inventory.html";
      return;
    }

    document.getElementById('authScreen').classList.add('hidden');
    updateUserBadge();
    applyRolePermissions();
    fetchTrailers();
  }
}

function logout() {
  localStorage.removeItem('sjl_user');
  sessionStorage.removeItem('sjl_user');
  currentUser = null;
  window.location.reload();
}

function updateUserBadge() {
  if (!currentUser) return;
  const nameElem = document.getElementById('userBadgeName');
  const roleElem = document.getElementById('userBadgeRole');
  if (nameElem) nameElem.innerText = currentUser.username;
  if (roleElem) roleElem.innerText = currentUser.role;

  const adminBtn = document.getElementById('adminBtn');
  if (adminBtn) {
    if (currentUser.role === 'SUPERVISOR') {
      adminBtn.classList.remove('hidden');
    } else {
      adminBtn.classList.add('hidden');
    }
  }
}

function applyRolePermissions() {
  const portAddBtn = document.getElementById('portAddBtnContainer');
  if (portAddBtn) {
    if (currentUser.role === 'SUPERVISOR' || currentUser.role === 'PORT_OPS') {
      portAddBtn.classList.remove('hidden');
    } else {
      portAddBtn.classList.add('hidden');
    }
  }

  // Auto-route driver role to driver view
  if (currentUser.role === 'DRIVER') {
    showModule('DRIVER');
  }
}

// ==================== 2. USER MANAGEMENT (SUPERVISOR) ====================
function toggleAdminModal() {
  const modal = document.getElementById('adminModal');
  if (modal.classList.contains('hidden')) {
    modal.classList.remove('hidden');
    fetchUsersList();
  } else {
    modal.classList.add('hidden');
  }
}

async function fetchUsersList() {
  try {
    const res = await fetch(`${DB_URL}/users.json`);
    const data = await res.json();
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';
    allUsers = [];

    if (!data) return;

    Object.keys(data).forEach(key => {
      const u = { username: key, ...data[key] };
      allUsers.push(u);

      tbody.innerHTML += `
        <tr class="hover:bg-slate-800/60">
          <td class="py-2.5 px-3 font-semibold text-white">${u.username}</td>
          <td class="py-2.5 px-3">
            <select onchange="updateUserRole('${u.username}', this.value)" class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-amber-400">
              <option value="PARK_AGENT" ${u.role === 'PARK_AGENT' ? 'selected' : ''}>Agent Parc / Pompiste</option>
              <option value="DRIVER" ${u.role === 'DRIVER' ? 'selected' : ''}>Chauffeur</option>
              <option value="CHARGE_CLIENT" ${u.role === 'CHARGE_CLIENT' ? 'selected' : ''}>Chargé Clientèle</option>
              <option value="PORT_OPS" ${u.role === 'PORT_OPS' ? 'selected' : ''}>Port Ops</option>
              <option value="OPERATOR" ${u.role === 'OPERATOR' ? 'selected' : ''}>Opérateur</option>
              <option value="SUPERVISOR" ${u.role === 'SUPERVISOR' ? 'selected' : ''}>Superviseur</option>
            </select>
          </td>
          <td class="py-2.5 px-3 text-right">
            <button onclick="deleteUser('${u.username}')" class="text-slate-500 hover:text-rose-400 p-1" title="Supprimer">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    console.error("Error fetching users:", err);
  }
}

async function adminCreateUser(e) {
  e.preventDefault();
  const rawU = document.getElementById('newUsername').value.trim();
  const pwd = document.getElementById('newPassword').value.trim();
  const role = document.getElementById('newRole').value;
  const cleanU = sanitizeKey(rawU);

  try {
    await fetch(`${DB_URL}/users/${cleanU}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd, role: role })
    });
    document.getElementById('adminCreateUserForm').reset();
    fetchUsersList();
    alert(`Compte ${cleanU} créé avec succès !`);
  } catch (err) {
    alert("Erreur lors de la création : " + err.message);
  }
}

async function updateUserRole(username, newRole) {
  try {
    await fetch(`${DB_URL}/users/${username}/role.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRole)
    });
  } catch (err) {
    alert("Erreur lors de la mise à jour : " + err.message);
  }
}

async function deleteUser(username) {
  if (username === currentUser.username) {
    alert("Vous ne pouvez pas supprimer votre propre compte actif.");
    return;
  }
  if (!confirm(`Supprimer définitivement l'utilisateur ${username} ?`)) return;

  try {
    await fetch(`${DB_URL}/users/${username}.json`, { method: 'DELETE' });
    fetchUsersList();
  } catch (err) {
    alert("Erreur : " + err.message);
  }
}

// ==================== 3. NAVIGATION & VIEW SWITCHING ====================
function showWelcomeScreen() {
  document.getElementById('welcomeScreen').classList.remove('hidden');
  document.getElementById('workspaceScreen').classList.add('hidden');
}

function openModule(moduleKey) {
  document.getElementById('welcomeScreen').classList.add('hidden');
  document.getElementById('workspaceScreen').classList.remove('hidden');
  showModule(moduleKey);
}

function showModule(moduleKey) {
  const tabs = ['PORT', 'PLANNING', 'DASHBOARD', 'DRIVER'];
  tabs.forEach(tab => {
    const el = document.getElementById(`module${tab.charAt(0) + tab.slice(1).toLowerCase()}`);
    const btn = document.getElementById(`tab${tab.charAt(0) + tab.slice(1).toLowerCase()}Btn`);
    if (el) el.classList.add('hidden');
    if (btn) {
      btn.className = "px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 text-slate-400 hover:text-white";
    }
  });

  const activeModule = document.getElementById(`module${moduleKey.charAt(0) + moduleKey.slice(1).toLowerCase()}`);
  const activeBtn = document.getElementById(`tab${moduleKey.charAt(0) + moduleKey.slice(1).toLowerCase()}Btn`);

  if (activeModule) activeModule.classList.remove('hidden');
  if (activeBtn) {
    activeBtn.className = "px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 bg-blue-600 text-white shadow";
  }

  render();
}

// ==================== 4. DATA OPS (PORT & TRIPTYQUE) ====================
async function fetchTrailers() {
  try {
    const res = await fetch(`${DB_URL}/trailers.json`);
    const data = await res.json();
    rawList = [];
    if (data) {
      Object.keys(data).forEach(k => {
        rawList.push({ id: k, ...data[k] });
      });
    }
    render();
  } catch (err) {
    console.error("Error fetching trailers:", err);
  }
}

function togglePortEntryModal() {
  const modal = document.getElementById('portEntryModal');
  modal.classList.toggle('hidden');
}

function openNewTrailerModal() {
  document.getElementById('editTrailerId').value = '';
  document.getElementById('entryForm').reset();
  document.getElementById('modalTitle').innerText = "Saisie Nouvelle Remorque Port";

  const now = new Date();
  document.getElementById('inputDateArrivee').value = now.toISOString().slice(0, 16);
  togglePortEntryModal();
}

function editTrailer(id) {
  const trailer = rawList.find(t => t.id === id);
  if (!trailer) return;

  document.getElementById('editTrailerId').value = trailer.id;
  document.getElementById('modalTitle').innerText = `Modifier Remorque: ${trailer.matricule}`;
  document.getElementById('inputMatricule').value = trailer.matricule || '';
  document.getElementById('inputClient').value = trailer.client || '';
  document.getElementById('inputTransitaire').value = trailer.transitaire || '';
  document.getElementById('inputDateArrivee').value = trailer.dateArrivee || '';
  document.getElementById('inputEtatDedouanement').value = trailer.etatDedouanement || 'Bien Dédouanée';
  document.getElementById('inputChauffeur').value = trailer.chauffeur || '';
  document.getElementById('inputDateSortie').value = trailer.dateSortie || '';
  document.getElementById('inputScellees').value = trailer.scellees || '';

  document.getElementById('inputBAD').value = trailer.bad || 'OK';
  document.getElementById('inputPli').value = trailer.pli || 'OK';
  document.getElementById('inputEUR1').value = trailer.eur1 || 'OK';
  document.getElementById('inputCarteGrise').value = trailer.carteGrise || 'OK';
  document.getElementById('inputAssur').value = trailer.assurance || 'OK';
  document.getElementById('inputVT').value = trailer.vt || 'OK';

  togglePortEntryModal();
}

async function saveTrailer(e) {
  e.preventDefault();
  const id = document.getElementById('editTrailerId').value;
  const matricule = sanitizeKey(document.getElementById('inputMatricule').value.toUpperCase());

  const payload = {
    matricule: matricule,
    client: document.getElementById('inputClient').value.trim(),
    transitaire: document.getElementById('inputTransitaire').value.trim(),
    dateArrivee: document.getElementById('inputDateArrivee').value,
    etatDedouanement: document.getElementById('inputEtatDedouanement').value,
    chauffeur: document.getElementById('inputChauffeur').value.trim(),
    dateSortie: document.getElementById('inputDateSortie').value,
    scellees: document.getElementById('inputScellees').value.trim(),
    bad: document.getElementById('inputBAD').value,
    pli: document.getElementById('inputPli').value,
    eur1: document.getElementById('inputEUR1').value,
    carteGrise: document.getElementById('inputCarteGrise').value,
    assurance: document.getElementById('inputAssur').value,
    vt: document.getElementById('inputVT').value,
    updatedAt: new Date().toISOString()
  };

  try {
    const targetKey = id || matricule;
    await fetch(`${DB_URL}/trailers/${targetKey}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    togglePortEntryModal();
    await fetchTrailers();
  } catch (err) {
    alert("Erreur lors de l'enregistrement : " + err.message);
  }
}

async function deleteTrailer(id) {
  if (!currentUser || currentUser.role !== 'SUPERVISOR') {
    alert("Action réservée aux superviseurs.");
    return;
  }
  if (!confirm("Voulez-vous vraiment supprimer cette remorque ?")) return;

  try {
    await fetch(`${DB_URL}/trailers/${id}.json`, { method: 'DELETE' });
    await fetchTrailers();
  } catch (err) {
    alert("Erreur : " + err.message);
  }
}

// ==================== 5. CALCULATION & RENDERING ====================
function calculateTriptyqueDays(dateSortieStr) {
  if (!dateSortieStr) return null;
  const sortie = new Date(dateSortieStr);
  const now = new Date();
  const diffTime = now - sortie;
  const daysInMorocco = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const daysRemaining = 30 - daysInMorocco;
  return { daysInMorocco, daysRemaining };
}

function render() {
  renderPortTable();
  renderPlanningTable();
  renderDashboard();
}

function renderPortTable() {
  const tbody = document.getElementById('portTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const countElem = document.getElementById('portTableCount');
  if (countElem) countElem.innerText = `${rawList.length} remorques`;

  rawList.forEach(t => {
    const isSupervisor = currentUser && currentUser.role === 'SUPERVISOR';
    const actions = `
      <button onclick="editTrailer('${t.id}')" class="text-blue-400 hover:text-blue-300 p-1"><i class="fa-solid fa-pen-to-square"></i></button>
      ${isSupervisor ? `<button onclick="deleteTrailer('${t.id}')" class="text-slate-500 hover:text-rose-400 p-1"><i class="fa-solid fa-trash-can"></i></button>` : ''}
    `;

    tbody.innerHTML += `
      <tr class="hover:bg-slate-800/50">
        <td class="py-2.5 px-3 font-bold text-yellow-300">${t.matricule}</td>
        <td class="py-2.5 px-3 text-slate-200">${t.client}</td>
        <td class="py-2.5 px-3 text-slate-400">${t.transitaire || '-'}</td>
        <td class="py-2.5 px-3 text-slate-300 whitespace-nowrap">${t.dateArrivee ? t.dateArrivee.replace('T', ' ') : '-'}</td>
        <td class="py-2.5 px-3 font-bold text-emerald-400">${t.etatDedouanement || '-'}</td>
        <td class="py-2.5 px-3 ${t.chauffeur === 'BESOIN TRACTEUR' ? 'text-rose-400 font-bold' : 'text-slate-200'}">${t.chauffeur || '-'}</td>
        <td class="py-2.5 px-3 text-emerald-400">${t.dateSortie || '-'}</td>
        <td class="py-2.5 px-2 text-center text-[10px] font-bold text-emerald-400">${t.bad || '-'}</td>
        <td class="py-2.5 px-2 text-center text-[10px] font-bold ${t.pli === 'OK' ? 'text-emerald-400' : 'text-rose-400'}">${t.pli || '-'}</td>
        <td class="py-2.5 px-2 text-center text-[10px] font-bold ${t.eur1 === 'OK' ? 'text-emerald-400' : 'text-amber-400'}">${t.eur1 || '-'}</td>
        <td class="py-2.5 px-2 text-center text-[10px] font-bold text-emerald-400">${t.carteGrise || '-'}</td>
        <td class="py-2.5 px-2 text-center text-[10px] font-bold text-emerald-400">${t.assurance || '-'}</td>
        <td class="py-2.5 px-2 text-center text-[10px] font-bold text-emerald-400">${t.vt || '-'}</td>
        <td class="py-2.5 px-3 text-right">${actions}</td>
      </tr>
    `;
  });
}

function renderPlanningTable() {
  const tbody = document.getElementById('planningTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  rawList.forEach(t => {
    const trip = calculateTriptyqueDays(t.dateSortie);
    let tripBadge = `<span class="text-slate-500">Au Port</span>`;

    if (trip) {
      if (trip.daysRemaining <= 3) {
        tripBadge = `<span class="bg-rose-950 text-rose-300 border border-rose-800 px-2 py-0.5 rounded font-bold">${trip.daysRemaining}J Restants (Critique)</span>`;
      } else if (trip.daysRemaining <= 10) {
        tripBadge = `<span class="bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 rounded font-bold">${trip.daysRemaining}J Restants</span>`;
      } else {
        tripBadge = `<span class="bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded font-bold">${trip.daysRemaining}J Restants</span>`;
      }
    }

    const isBooked = !!t.bookingClient;
    const bookBadge = isBooked 
      ? `<span class="text-purple-400 font-bold"><i class="fa-solid fa-lock"></i> Réservé: ${t.bookingClient}</span>` 
      : `<span class="text-emerald-400 font-bold"><i class="fa-solid fa-bolt"></i> Disponible</span>`;

    const bookAction = isBooked
      ? `<button onclick="releaseBooking('${t.id}')" class="bg-slate-700 hover:bg-slate-600 text-xs px-2.5 py-1 rounded text-slate-300">Libérer</button>`
      : `<button onclick="promptBooking('${t.id}')" class="bg-purple-600 hover:bg-purple-500 text-xs px-2.5 py-1 rounded text-white font-bold">Réserver</button>`;

    tbody.innerHTML += `
      <tr class="hover:bg-slate-800/50">
        <td class="py-3 px-4 font-bold text-yellow-300">${t.matricule}</td>
        <td class="py-3 px-4 text-slate-200">${t.client}</td>
        <td class="py-3 px-4 text-slate-300">${t.dateSortie || '-'}</td>
        <td class="py-3 px-4">${tripBadge}</td>
        <td class="py-3 px-4 text-center text-xs">Pli: ${t.pli || '-'} | CG: ${t.carteGrise || '-'}</td>
        <td class="py-3 px-4 text-center text-xs">${bookBadge}</td>
        <td class="py-3 px-4 text-right">${bookAction}</td>
      </tr>
    `;
  });
}

async function promptBooking(id) {
  const clientName = prompt("Entrez le nom du client Export pour cette remorque :");
  if (!clientName) return;

  try {
    await fetch(`${DB_URL}/trailers/${id}/bookingClient.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clientName.trim().toUpperCase())
    });
    await fetchTrailers();
  } catch (err) {
    alert("Erreur: " + err.message);
  }
}

async function releaseBooking(id) {
  if (!confirm("Libérer cette remorque pour les autres chargés de clientèle ?")) return;
  try {
    await fetch(`${DB_URL}/trailers/${id}/bookingClient.json`, { method: 'DELETE' });
    await fetchTrailers();
  } catch (err) {
    alert("Erreur: " + err.message);
  }
}

function renderDashboard() {
  const tbody = document.getElementById('dashboardTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  let totalInCirculation = 0;
  let criticalCount = 0;
  let warningCount = 0;
  let bookedCount = 0;

  rawList.forEach(t => {
    const trip = calculateTriptyqueDays(t.dateSortie);
    if (t.dateSortie) totalInCirculation++;
    if (t.bookingClient) bookedCount++;

    let statusHtml = '-';
    if (trip) {
      if (trip.daysRemaining <= 3) {
        criticalCount++;
        statusHtml = `<span class="text-rose-400 font-bold">${trip.daysRemaining} Jours (URGENT)</span>`;
      } else if (trip.daysRemaining <= 10) {
        warningCount++;
        statusHtml = `<span class="text-amber-400 font-bold">${trip.daysRemaining} Jours</span>`;
      } else {
        statusHtml = `<span class="text-emerald-400 font-bold">${trip.daysRemaining} Jours</span>`;
      }
    }

    tbody.innerHTML += `
      <tr class="hover:bg-slate-800/50">
        <td class="py-3 px-4 font-bold text-yellow-300">${t.matricule}</td>
        <td class="py-3 px-4 text-slate-200">${t.client}</td>
        <td class="py-3 px-4 text-slate-400">${t.dateSortie || 'Au Port'}</td>
        <td class="py-3 px-4 text-slate-300">${trip ? trip.daysInMorocco + ' jours' : '-'}</td>
        <td class="py-3 px-4">${statusHtml}</td>
        <td class="py-3 px-4 text-center text-xs">CG: ${t.carteGrise || '-'} / Assur: ${t.assurance || '-'}</td>
        <td class="py-3 px-4 text-center text-xs">${t.bookingClient ? `<span class="text-purple-400 font-bold">${t.bookingClient}</span>` : '<span class="text-slate-500">Non attribuée</span>'}</td>
        <td class="py-3 px-4 text-right">
          <button onclick="editTrailer('${t.id}')" class="text-blue-400 hover:text-blue-300"><i class="fa-solid fa-pen-to-square"></i></button>
        </td>
      </tr>
    `;
  });

  const elTotal = document.getElementById('kpiTotal');
  const elCrit = document.getElementById('kpiCritical');
  const elWarn = document.getElementById('kpiWarning');
  const elBook = document.getElementById('kpiBooked');

  if (elTotal) elTotal.innerText = totalInCirculation;
  if (elCrit) elCrit.innerText = criticalCount;
  if (elWarn) elWarn.innerText = warningCount;
  if (elBook) elBook.innerText = bookedCount;
}

// ==================== 6. DRIVER VIEW ACTIONS ====================
function setEquipType(type) {
  document.getElementById('driverEquipType').value = type;
  ['BARRES', 'SANGLES', 'CANTONERAS'].forEach(t => {
    const btn = document.getElementById(`btnType${t.charAt(0) + t.slice(1).toLowerCase()}`);
    if (btn) {
      if (t === type) {
        btn.className = "equip-btn bg-blue-600 text-white font-bold py-3 px-2 rounded-xl text-xs border border-blue-500 transition shadow";
      } else {
        btn.className = "equip-btn bg-slate-900 text-slate-400 font-bold py-3 px-2 rounded-xl text-xs border border-slate-700 transition";
      }
    }
  });
}

function setSens(sens) {
  document.getElementById('driverSens').value = sens;
  const btnImp = document.getElementById('btnSensImport');
  const btnExp = document.getElementById('btnSensExport');

  if (sens === 'IMPORT') {
    btnImp.className = "sens-btn bg-emerald-600 text-white font-bold py-3 px-3 rounded-xl text-xs border border-emerald-500 transition shadow";
    btnExp.className = "sens-btn bg-slate-900 text-slate-400 font-bold py-3 px-3 rounded-xl text-xs border border-slate-700 transition";
  } else {
    btnExp.className = "sens-btn bg-purple-600 text-white font-bold py-3 px-3 rounded-xl text-xs border border-purple-500 transition shadow";
    btnImp.className = "sens-btn bg-slate-900 text-slate-400 font-bold py-3 px-3 rounded-xl text-xs border border-slate-700 transition";
  }
}

async function submitDriverEquipment(e) {
  e.preventDefault();
  const matricule = sanitizeKey(document.getElementById('driverMatricule').value.toUpperCase());
  const equipType = document.getElementById('driverEquipType').value;
  const count = parseInt(document.getElementById('driverCount').value) || 0;
  const sens = document.getElementById('driverSens').value;

  const payload = {
    driver: currentUser ? currentUser.username : "CHAUFFEUR",
    matricule: matricule,
    type: equipType,
    count: count,
    sens: sens,
    timestamp: new Date().toISOString()
  };

  try {
    await fetch(`${DB_URL}/driver_logs.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    alert("Déclaration équipement enregistrée avec succès !");
    document.getElementById('driverForm').reset();
  } catch (err) {
    alert("Erreur : " + err.message);
  }
}

// ==================== 7. EXPORT TO EXCEL ====================
function exportToExcel() {
  if (rawList.length === 0) {
    alert("Aucune remorque à exporter.");
    return;
  }
  const ws = XLSX.utils.json_to_sheet(rawList);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Remorques");
  XLSX.writeFile(wb, `SJL_Fleet_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// Initial Boot
window.addEventListener('DOMContentLoaded', () => {
  checkExistingSession();
});