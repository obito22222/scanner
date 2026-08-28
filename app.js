// ⚠️ FIREBASE REALTIME DATABASE URL
const DB_URL = "https://sjl-fleet-triptyque-default-rtdb.firebaseio.com";

let currentUser = JSON.parse(localStorage.getItem('sjl_user') || 'null');
let rawList = [];
let usersList = {};
let activeModule = 'WELCOME';

// Helper to sanitize Firebase keys
function sanitizeKey(str) {
  return encodeURIComponent(str.trim().toLowerCase().replace(/\s+/g, '_').replace(/[\.\#\$\[\]\/]/g, ''));
}

const ROLE_TITLES = {
  'SUPERVISOR': 'Superviseur / Direction',
  'ADMIN': 'Superviseur / Direction',
  'PORT_OPS': 'Port Tanger Med (Saisie)',
  'CHARGE_CLIENT': 'Chargé de Clientèle',
  'DRIVER': 'Chauffeur / Terrain',
  'OPERATOR': 'Opérateur (Lecture Seule)'
};

function isSupervisor(role) {
  return role === 'SUPERVISOR' || role === 'ADMIN';
}

function togglePortEntryModal() {
  document.getElementById('portEntryModal').classList.toggle('hidden');
}

function openNewTrailerModal() {
  document.getElementById('editTrailerId').value = '';
  document.getElementById('modalTitle').innerText = 'Saisie Nouvelle Remorque Port';
  document.getElementById('entryForm').reset();
  
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('inputDateArrivee').value = now.toISOString().slice(0, 16);
  
  togglePortEntryModal();
}

function openEditTrailerModal(id) {
  const item = rawList.find(i => i.id === id);
  if (!item) return;

  document.getElementById('editTrailerId').value = item.id;
  document.getElementById('modalTitle').innerText = `Modifier Remorque: ${item.matricule}`;

  document.getElementById('inputMatricule').value = item.matricule;
  document.getElementById('inputClient').value = item.client;
  document.getElementById('inputTransitaire').value = item.transitaire !== '-' ? item.transitaire : '';
  document.getElementById('inputDateArrivee').value = item.dateArrivee !== '-' ? item.dateArrivee : '';
  document.getElementById('inputEtatDedouanement').value = item.etatDedouanement;
  document.getElementById('inputChauffeur').value = item.chauffeur !== '-' ? item.chauffeur : '';
  document.getElementById('inputDateSortie').value = item.rawDateSortie || '';
  document.getElementById('inputScellees').value = item.scellees !== '-' ? item.scellees : '';
  document.getElementById('inputBAD').value = item.bad;
  document.getElementById('inputPli').value = item.pli;
  document.getElementById('inputEUR1').value = item.eur1;
  document.getElementById('inputCarteGrise').value = item.carteGrise;
  document.getElementById('inputAssur').value = item.assur;
  document.getElementById('inputVT').value = item.vt;

  togglePortEntryModal();
}

function showWelcomeScreen() {
  activeModule = 'WELCOME';
  document.getElementById('welcomeScreen').classList.remove('hidden');
  document.getElementById('workspaceScreen').classList.add('hidden');
}

function openModule(moduleName) {
  activeModule = moduleName;
  document.getElementById('welcomeScreen').classList.add('hidden');
  document.getElementById('workspaceScreen').classList.remove('hidden');

  document.getElementById('modulePort').classList.toggle('hidden', moduleName !== 'PORT');
  document.getElementById('modulePlanning').classList.toggle('hidden', moduleName !== 'PLANNING');
  document.getElementById('moduleDashboard').classList.toggle('hidden', moduleName !== 'DASHBOARD');
  document.getElementById('moduleDriver').classList.add('hidden'); // hidden unless driver role

  const tabs = [
    { id: 'tabPortBtn', name: 'PORT', color: 'bg-blue-600 text-white' },
    { id: 'tabPlanningBtn', name: 'PLANNING', color: 'bg-purple-600 text-white' },
    { id: 'tabDashboardBtn', name: 'DASHBOARD', color: 'bg-emerald-600 text-white' }
  ];

  tabs.forEach(t => {
    const btn = document.getElementById(t.id);
    if (t.name === moduleName) {
      btn.className = `px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${t.color}`;
    } else {
      btn.className = `px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 text-slate-400 hover:text-white`;
    }
  });

  render();
}

function checkAuth() {
  if (!currentUser) {
    document.getElementById('authScreen').classList.remove('hidden');
  } else {
    document.getElementById('authScreen').classList.add('hidden');
    const username = currentUser.username || currentUser.name || "Utilisateur";
    document.getElementById('userBadgeName').innerText = username;
    document.getElementById('userBadgeRole').innerText = ROLE_TITLES[currentUser.role] || currentUser.role;

    if (isSupervisor(currentUser.role)) {
      document.getElementById('adminBtn').classList.remove('hidden');
    } else {
      document.getElementById('adminBtn').classList.add('hidden');
    }

    const canAddPort = currentUser.role === 'PORT_OPS' || isSupervisor(currentUser.role);
    document.getElementById('portAddBtnContainer').classList.toggle('hidden', !canAddPort);

    // If user is a driver, redirect directly to the simplified interface
    if (currentUser.role === 'DRIVER') {
      document.getElementById('welcomeScreen').classList.add('hidden');
      document.getElementById('workspaceScreen').classList.remove('hidden');
      document.getElementById('modulePort').classList.add('hidden');
      document.getElementById('modulePlanning').classList.add('hidden');
      document.getElementById('moduleDashboard').classList.add('hidden');
      document.getElementById('moduleDriver').classList.remove('hidden');
      const topNavTabs = document.querySelector('#workspaceScreen > div:first-child');
      if (topNavTabs) topNavTabs.classList.add('hidden');
    }
  }
}

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

  try {
    const res = await fetch(`${DB_URL}/users/${cleanUser}.json`);
    const user = await res.json();

    if (!user || user.password !== password) {
      errorDiv.innerText = "Identifiant ou mot de passe incorrect.";
      errorDiv.classList.remove('hidden');
      return;
    }

    currentUser = user;
    localStorage.setItem('sjl_user', JSON.stringify(currentUser));
    checkAuth();
    loadData();
  } catch (err) {
    errorDiv.innerText = "Erreur réseau: " + err.message;
    errorDiv.classList.remove('hidden');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>Se connecter</span> <i class="fa-solid fa-arrow-right"></i>`;
    }
  }
}

function logout() {
  localStorage.removeItem('sjl_user');
  currentUser = null;
  checkAuth();
}

// Driver Form State Helpers
let selectedEquipType = 'BARRES';
let selectedSens = 'IMPORT';

function setEquipType(type) {
  selectedEquipType = type;
  document.getElementById('driverEquipType').value = type;
  
  ['Barres', 'Sangles', 'Cantoneras'].forEach(t => {
    const btn = document.getElementById(`btnType${t}`);
    const isSelected = t.toUpperCase() === type;
    btn.className = isSelected ? 
      "equip-btn bg-blue-600 text-white font-bold py-3 px-2 rounded-xl text-xs border border-blue-500 transition shadow" :
      "equip-btn bg-slate-900 text-slate-400 font-bold py-3 px-2 rounded-xl text-xs border border-slate-700 transition";
  });
}

function setSens(sens) {
  selectedSens = sens;
  document.getElementById('driverSens').value = sens;

  ['Import', 'Export'].forEach(s => {
    const btn = document.getElementById(`btnSens${s}`);
    const isSelected = s.toUpperCase() === sens;
    btn.className = isSelected ? 
      "sens-btn bg-emerald-600 text-white font-bold py-3 px-3 rounded-xl text-xs border border-emerald-500 transition shadow" :
      "sens-btn bg-slate-900 text-slate-400 font-bold py-3 px-3 rounded-xl text-xs border border-slate-700 transition";
  });
}

async function submitDriverEquipment(e) {
  e.preventDefault();
  const btn = document.getElementById('driverSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement...`;

  const matricule = document.getElementById('driverMatricule').value.trim().toUpperCase();
  const count = parseInt(document.getElementById('driverCount').value) || 0;
  const driverName = currentUser.username || currentUser.name;

  const payload = {
    matricule: matricule,
    equipType: selectedEquipType,
    count: count,
    sens: selectedSens,
    driver: driverName,
    timestamp: new Date().toISOString()
  };

  try {
    await fetch(`${DB_URL}/equipment_logs.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    alert(`✅ Enregistré avec succès !\nRemorque: ${matricule}\n${selectedEquipType}: ${count} (${selectedSens})`);
    document.getElementById('driverForm').reset();
    document.getElementById('driverCount').value = "4";
    setEquipType('BARRES');
    setSens('IMPORT');
  } catch (err) {
    alert("Erreur d'enregistrement: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-circle-check text-lg"></i> <span>Valider et Enregistrer</span>`;
  }
}

// Supervisor account creation handler
async function adminCreateUser(e) {
  e.preventDefault();
  if (!currentUser || !isSupervisor(currentUser.role)) {
    alert("Action réservée au Superviseur.");
    return;
  }

  const rawUser = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value.trim();
  const role = document.getElementById('newRole').value;
  const cleanUser = sanitizeKey(rawUser);

  if (!cleanUser || !password) {
    alert("Veuillez remplir tous les champs.");
    return;
  }

  const btn = document.getElementById('adminCreateBtn');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Création...`;

  try {
    const res = await fetch(`${DB_URL}/users/${cleanUser}.json`);
    const existing = await res.json();

    if (existing) {
      alert("Cet identifiant existe déjà.");
      return;
    }

    const userData = {
      username: rawUser,
      userKey: cleanUser,
      password: password,
      role: role,
      createdAt: new Date().toISOString()
    };

    await fetch(`${DB_URL}/users/${cleanUser}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData)
    });

    alert(`Compte '${rawUser}' créé avec succès en tant que: ${ROLE_TITLES[role]}`);
    document.getElementById('adminCreateUserForm').reset();
    loadUsersList();
  } catch (err) {
    alert("Erreur lors de la création: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-check"></i> <span>Créer le compte</span>`;
  }
}

async function deleteUser(userKey) {
  if (!confirm(`Êtes-vous sûr de vouloir supprimer définitivement le compte '${userKey}' ?`)) return;

  try {
    await fetch(`${DB_URL}/users/${userKey}.json`, { method: "DELETE" });
    loadUsersList();
  } catch (err) {
    alert("Erreur de suppression: " + err.message);
  }
}

async function loadData() {
  if (!DB_URL || DB_URL.includes("YOUR-PROJECT-NAME")) return;

  try {
    if (currentUser) {
      const userKey = currentUser.userKey || sanitizeKey(currentUser.username || currentUser.name || "");
      const userRes = await fetch(`${DB_URL}/users/${userKey}.json`);
      const fresh = await userRes.json();
      if (fresh) {
        currentUser = fresh;
        localStorage.setItem('sjl_user', JSON.stringify(currentUser));
        checkAuth();
      }
    }

    const res = await fetch(`${DB_URL}/trailers.json`);
    const data = await res.json();

    rawList = [];
    if (data) {
      Object.keys(data).forEach(key => {
        const item = data[key];
        let daysPassed = 0;
        let left = 30;
        let hasExited = false;

        if (item.dateSortie) {
          hasExited = true;
          const exitDate = new Date(item.dateSortie);
          exitDate.setHours(0, 0, 0, 0);
          
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          let diffDays = Math.round((today - exitDate) / (1000 * 60 * 60 * 24));
          if (diffDays < 0) diffDays = 0;
          
          daysPassed = diffDays;
          left = 30 - daysPassed;
        }

        rawList.push({
          id: key,
          matricule: item.matricule,
          client: item.client || "-",
          transitaire: item.transitaire || "-",
          dateArrivee: item.dateArrivee || "-",
          etatDedouanement: item.etatDedouanement || "En cours",
          chauffeur: item.chauffeur || "-",
          dateSortie: item.dateSortie ? new Date(item.dateSortie).toLocaleDateString('fr-FR') : null,
          rawDateSortie: item.dateSortie || '',
          scellees: item.scellees || "-",
          bad: item.bad || "NON",
          pli: item.pli || "A_CONFIRMER",
          eur1: item.eur1 || "A_CONFIRMER",
          carteGrise: item.carteGrise || "A_CONFIRMER",
          assur: item.assur || "A_CONFIRMER",
          vt: item.vt || "A_CONFIRMER",
          daysPassed: Math.max(0, daysPassed),
          daysRemaining: left,
          status: left <= 3 ? "CRITICAL" : (left <= 10 ? "WARNING" : "SAFE"),
          bookedBy: item.bookedBy || null,
          hasExited: hasExited
        });
      });
    }

    render();
  } catch (err) {
    console.error("Data load error:", err);
  }
}

async function saveTrailer(e) {
  e.preventDefault();
  if (currentUser.role !== 'PORT_OPS' && !isSupervisor(currentUser.role)) {
    alert("Action réservée à l'équipe Port Tanger Med.");
    return;
  }

  const editId = document.getElementById('editTrailerId').value;
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement...`;

  const username = currentUser.username || currentUser.name;
  const payload = {
    matricule: document.getElementById('inputMatricule').value.trim().toUpperCase(),
    client: document.getElementById('inputClient').value.trim().toUpperCase(),
    transitaire: document.getElementById('inputTransitaire').value.trim().toUpperCase(),
    dateArrivee: document.getElementById('inputDateArrivee').value,
    etatDedouanement: document.getElementById('inputEtatDedouanement').value,
    chauffeur: document.getElementById('inputChauffeur').value.trim(),
    dateSortie: document.getElementById('inputDateSortie').value || null,
    scellees: document.getElementById('inputScellees').value.trim(),
    bad: document.getElementById('inputBAD').value,
    pli: document.getElementById('inputPli').value,
    eur1: document.getElementById('inputEUR1').value,
    carteGrise: document.getElementById('inputCarteGrise').value,
    assur: document.getElementById('inputAssur').value,
    vt: document.getElementById('inputVT').value,
    timestamp: new Date().toISOString(),
    updatedBy: username
  };

  try {
    if (editId) {
      await fetch(`${DB_URL}/trailers/${editId}.json`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      payload.bookedBy = null;
      await fetch(`${DB_URL}/trailers.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }

    togglePortEntryModal();
    await loadData();
  } catch (err) {
    alert("Erreur: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> <span>Enregistrer</span>`;
  }
}

async function bookTrailer(id, matricule) {
  if (currentUser.role !== 'CHARGE_CLIENT' && !isSupervisor(currentUser.role)) {
    alert("Action réservée aux Chargés de Clientèle.");
    return;
  }

  if (!confirm(`Confirmez-vous la réservation de la remorque ${matricule} pour votre client export ?`)) return;

  const username = currentUser.username || currentUser.name;
  try {
    await fetch(`${DB_URL}/trailers/${id}/bookedBy.json`, {
      method: "PUT",
      body: JSON.stringify(username)
    });
    await loadData();
  } catch (err) {
    alert("Erreur de réservation: " + err.message);
  }
}

async function releaseTrailer(id, matricule) {
  if (!confirm(`Libérer la remorque ${matricule} ?`)) return;

  try {
    await fetch(`${DB_URL}/trailers/${id}/bookedBy.json`, { method: "DELETE" });
    await loadData();
  } catch (err) {
    alert("Erreur de libération: " + err.message);
  }
}

async function deleteTrailer(id) {
  if (currentUser.role !== 'PORT_OPS' && !isSupervisor(currentUser.role)) {
    alert("Action réservée à l'équipe Port.");
    return;
  }

  if (!confirm("Clôturer le triptyque (Remorque embarquée / sortie définitive du Maroc) ?")) return;
  try {
    await fetch(`${DB_URL}/trailers/${id}.json`, { method: "DELETE" });
    await loadData();
  } catch (err) {
    alert("Suppression impossible: " + err.message);
  }
}

function badgeDoc(status) {
  if (status === "OK") return `<span class="badge-ok text-[10px] px-1.5 py-0.5 rounded font-bold">OK</span>`;
  if (status === "SANS") return `<span class="badge-sans text-[10px] px-1.5 py-0.5 rounded font-bold">SANS</span>`;
  if (status === "BOITE") return `<span class="badge-blue text-[10px] px-1.5 py-0.5 rounded font-bold">BOÎTE</span>`;
  return `<span class="badge-warn text-[10px] px-1.5 py-0.5 rounded font-bold">À CONF</span>`;
}

function render() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const filter = document.getElementById('filterStatus').value;
  const activeUser = currentUser ? (currentUser.username || currentUser.name) : '';

  // 1. PORT VIEW
  document.getElementById('portTableCount').innerText = `${rawList.length} remorques`;
  const portBody = document.getElementById('portTableBody');
  portBody.innerHTML = '';

  if (rawList.length === 0) {
    portBody.innerHTML = `<tr><td colspan="14" class="text-center py-8 text-slate-500">Aucune donnée au port.</td></tr>`;
  } else {
    rawList.forEach(row => {
      let chStyle = row.chauffeur.toUpperCase().includes("BESOIN") ? "text-rose-400 font-bold" : "text-slate-300";
      let etatStyle = row.etatDedouanement.toUpperCase().includes("BIEN") ? "text-emerald-400 font-bold" : "text-amber-400";

      const canEditDelete = currentUser && (currentUser.role === 'PORT_OPS' || isSupervisor(currentUser.role));
      const actionsCol = canEditDelete ? `
        <div class="flex items-center justify-end gap-1.5">
          <button onclick="openEditTrailerModal('${row.id}')" title="Modifier les informations" class="text-slate-400 hover:text-blue-400 p-1">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button onclick="deleteTrailer('${row.id}')" title="Clôturer / Supprimer" class="text-slate-400 hover:text-rose-400 p-1">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      ` : '-';

      portBody.innerHTML += `
        <tr class="hover:bg-slate-700/40">
          <td class="py-2 px-3 font-bold text-yellow-300">${row.matricule}</td>
          <td class="py-2 px-3">${row.client}</td>
          <td class="py-2 px-3 text-slate-400">${row.transitaire}</td>
          <td class="py-2 px-3">${row.dateArrivee !== '-' ? row.dateArrivee.replace('T', ' ') : '-'}</td>
          <td class="py-2 px-3 ${etatStyle}">${row.etatDedouanement}</td>
          <td class="py-2 px-3 ${chStyle}">${row.chauffeur}</td>
          <td class="py-2 px-3 font-bold ${row.dateSortie ? 'text-emerald-400' : 'text-slate-500'}">${row.dateSortie || 'Au Port'}</td>
          <td class="py-2 px-2 text-center">${row.bad === 'OK' ? '<span class="text-emerald-400 font-bold">OK</span>' : '<span class="text-slate-500">-</span>'}</td>
          <td class="py-2 px-2 text-center">${badgeDoc(row.pli)}</td>
          <td class="py-2 px-2 text-center">${badgeDoc(row.eur1)}</td>
          <td class="py-2 px-2 text-center">${badgeDoc(row.carteGrise)}</td>
          <td class="py-2 px-2 text-center">${badgeDoc(row.assur)}</td>
          <td class="py-2 px-2 text-center">${badgeDoc(row.vt)}</td>
          <td class="py-2 px-3 text-right">${actionsCol}</td>
        </tr>
      `;
    });
  }

  // 2. TRIPTYQUE FILTERED LIST
  const triptyqueList = rawList.filter(item => {
    const matchesSearch = item.matricule.toLowerCase().includes(search) ||
                          item.client.toLowerCase().includes(search) ||
                          (item.bookedBy && item.bookedBy.toLowerCase().includes(search));

    let matchesStatus = true;
    if (filter === "CRITICAL") matchesStatus = item.status === "CRITICAL";
    else if (filter === "WARNING") matchesStatus = item.status === "WARNING";
    else if (filter === "SAFE") matchesStatus = item.status === "SAFE";
    else if (filter === "AVAILABLE") matchesStatus = !item.bookedBy;
    else if (filter === "BOOKED") matchesStatus = !!item.bookedBy;

    return matchesSearch && matchesStatus && item.hasExited;
  });

  triptyqueList.sort((a, b) => a.daysRemaining - b.daysRemaining);

  document.getElementById('kpiTotal').innerText = triptyqueList.length;
  document.getElementById('kpiCritical').innerText = triptyqueList.filter(i => i.status === "CRITICAL").length;
  document.getElementById('kpiWarning').innerText = triptyqueList.filter(i => i.status === "WARNING").length;
  document.getElementById('kpiBooked').innerText = triptyqueList.filter(i => !!i.bookedBy).length;

  const planBody = document.getElementById('planningTableBody');
  planBody.innerHTML = '';
  const dashBody = document.getElementById('dashboardTableBody');
  dashBody.innerHTML = '';

  if (triptyqueList.length === 0) {
    const emptyMsg = `<tr><td colspan="8" class="text-center py-8 text-slate-500">Aucune remorque en circulation (nécessite une date de sortie port).</td></tr>`;
    planBody.innerHTML = emptyMsg;
    dashBody.innerHTML = emptyMsg;
  } else {
    triptyqueList.forEach(row => {
      let badgeClass = "bg-emerald-900/60 text-emerald-300 border-emerald-700";
      let statusText = `${row.daysRemaining}j restants`;

      if (row.status === "CRITICAL") {
        badgeClass = "bg-rose-900/70 text-rose-300 border-rose-700 font-bold animate-pulse";
        statusText = row.daysRemaining < 0 ? `EXPIRÉ (${Math.abs(row.daysRemaining)}j)` : `URGENT: ${row.daysRemaining}j`;
      } else if (row.status === "WARNING") {
        badgeClass = "bg-amber-900/60 text-amber-300 border-amber-700";
      }

      const allDocsOk = row.carteGrise === "OK" && row.assur === "OK" && row.vt === "OK";
      const docBadge = allDocsOk ? 
        `<span class="badge-ok text-[11px] px-2 py-0.5 rounded-full font-bold">✓ Pli Conforme</span>` :
        `<span class="badge-warn text-[11px] px-2 py-0.5 rounded-full font-bold">⚠ Docs Incomplets</span>`;

      let bookingCol = '';
      if (row.bookedBy) {
        const isMine = activeUser === row.bookedBy || isSupervisor(currentUser.role);
        bookingCol = `
          <div class="flex items-center justify-center gap-1.5">
            <span class="inline-flex items-center gap-1 bg-purple-950/80 border border-purple-700 text-purple-300 px-2.5 py-1 rounded-lg text-[11px] font-bold">
              <i class="fa-solid fa-user-lock"></i> Prise par ${row.bookedBy}
            </span>
            ${isMine ? `<button onclick="releaseTrailer('${row.id}', '${row.matricule}')" title="Libérer" class="text-rose-400 hover:text-rose-300 text-xs px-1 font-bold">✕</button>` : ''}
          </div>
        `;
      } else {
        const canBook = currentUser && (currentUser.role === 'CHARGE_CLIENT' || isSupervisor(currentUser.role));
        bookingCol = canBook ? `
          <div class="text-center">
            <button onclick="bookTrailer('${row.id}', '${row.matricule}')" class="bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-600/50 px-2.5 py-1 rounded-md text-[11px] font-semibold transition">
              ⚡ Planifier cette remorque
            </button>
          </div>
        ` : `<span class="text-slate-500 text-[11px] italic">Disponible</span>`;
      }

      const canDelete = currentUser && (currentUser.role === 'PORT_OPS' || isSupervisor(currentUser.role));
      const actionCol = canDelete ? `
        <button onclick="deleteTrailer('${row.id}')" title="Clôturer Triptyque" class="text-slate-500 hover:text-emerald-400 p-1 transition">
          <i class="fa-solid fa-ship"></i>
        </button>
      ` : `<span class="text-slate-600 text-[10px]">-</span>`;

      planBody.innerHTML += `
        <tr class="hover:bg-slate-700/40">
          <td class="py-3 px-4 font-bold text-yellow-400">${row.matricule}</td>
          <td class="py-3 px-4">${row.client}</td>
          <td class="py-3 px-4">${row.dateSortie}</td>
          <td class="py-3 px-4 font-bold ${row.daysRemaining <= 3 ? 'text-rose-400' : 'text-slate-100'}">${row.daysRemaining} j</td>
          <td class="py-3 px-4 text-center">${docBadge}</td>
          <td class="py-3 px-4 text-center">${bookingCol}</td>
          <td class="py-3 px-4 text-right">${actionCol}</td>
        </tr>
      `;

      dashBody.innerHTML += `
        <tr class="hover:bg-slate-700/40">
          <td class="py-3 px-4 font-bold text-yellow-400">${row.matricule}</td>
          <td class="py-3 px-4">${row.client}</td>
          <td class="py-3 px-4">${row.dateSortie}</td>
          <td class="py-3 px-4 font-semibold text-slate-300">${row.daysPassed} jours</td>
          <td class="py-3 px-4 font-bold ${row.daysRemaining <= 3 ? 'text-rose-400' : 'text-slate-100'}">${row.daysRemaining} j</td>
          <td class="py-3 px-4 text-center">${docBadge}</td>
          <td class="py-3 px-4">${bookingCol}</td>
          <td class="py-3 px-4 text-right">${actionCol}</td>
        </tr>
      `;
    });
  }
}

async function toggleAdminModal() {
  const modal = document.getElementById('adminModal');
  modal.classList.toggle('hidden');
  if (!modal.classList.contains('hidden')) {
    loadUsersList();
  }
}

async function loadUsersList() {
  const res = await fetch(`${DB_URL}/users.json`);
  usersList = await res.json() || {};
  
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = '';

  Object.keys(usersList).forEach(userKey => {
    const u = usersList[userKey];
    const displayUsername = u.username || userKey;
    tbody.innerHTML += `
      <tr class="hover:bg-slate-700/40">
        <td class="py-3 px-3 font-bold text-white capitalize">
          ${displayUsername}
        </td>
        <td class="py-3 px-3 text-amber-400 font-semibold">${ROLE_TITLES[u.role] || u.role}</td>
        <td class="py-3 px-3 text-right flex items-center justify-end gap-2">
          <select onchange="updateUserRole('${userKey}', this.value)" class="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white">
            <option value="DRIVER" ${u.role === 'DRIVER' ? 'selected' : ''}>Chauffeur</option>
            <option value="OPERATOR" ${u.role === 'OPERATOR' ? 'selected' : ''}>Opérateur (Lecture)</option>
            <option value="CHARGE_CLIENT" ${u.role === 'CHARGE_CLIENT' ? 'selected' : ''}>Chargé de Clientèle</option>
            <option value="PORT_OPS" ${u.role === 'PORT_OPS' ? 'selected' : ''}>Port Tanger Med</option>
            <option value="SUPERVISOR" ${isSupervisor(u.role) ? 'selected' : ''}>Superviseur</option>
          </select>
          <button onclick="deleteUser('${userKey}')" title="Supprimer utilisateur" class="text-slate-500 hover:text-rose-400 p-1 transition">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  });
}

async function updateUserRole(targetKey, newRole) {
  await fetch(`${DB_URL}/users/${targetKey}/role.json`, {
    method: "PUT",
    body: JSON.stringify(newRole)
  });
  alert(`Rôle mis à jour vers: ${ROLE_TITLES[newRole]}`);
  loadUsersList();
  loadData();
}

function exportToExcel() {
  if (rawList.length === 0) {
    alert("Aucune donnée à exporter !");
    return;
  }
  const exportData = rawList.map(item => ({
    "MATRICULE": item.matricule,
    "CLIENT": item.client,
    "TRANSITAIRE": item.transitaire,
    "DATE ARRIVEE PORT": item.dateArrivee,
    "ETAT DEDOUANEMENT": item.etatDedouanement,
    "CHAUFFEUR / TRACTION": item.chauffeur,
    "DATE SORTIE PORT": item.rawDateSortie || "AU PORT",
    "BAD": item.bad,
    "PLI": item.pli,
    "EUR1": item.eur1,
    "CARTE GRISE": item.carteGrise,
    "ASSURANCE": item.assur,
    "VISITE TECHNIQUE": item.vt,
    "JOURS RESTANTS TRIPTYQUE": item.hasExited ? item.daysRemaining : "N/A",
    "PLANIFIE PAR": item.bookedBy || "DISPONIBLE"
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "SJL_Situation_Port");
  XLSX.writeFile(wb, `SJL_Port_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// Startup
checkAuth();
loadData();
setInterval(loadData, 10000);