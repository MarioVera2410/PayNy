// /assets/app.js

document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('body#dashboard-page')) {
        checkSession();
        document.getElementById('logoutButton').addEventListener('click', logout);

        setupPushNotifications();

        const themeToggle = document.getElementById('theme-toggle'); // Asegúrate que tu botón tenga id="theme-toggle"
        if(themeToggle) {
            themeToggle.addEventListener('click', () => {
                const isDark = document.documentElement.classList.toggle('dark');
                localStorage.setItem('theme', isDark ? 'dark' : 'light');
            });
        }
    }
});

let currentUser = null;
let paymentThreshold = 10000;
let deferredPrompt = null;

// Mostrar botón “Instalar” cuando el navegador dispare el prompt
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const installBtn = document.getElementById('installButton');
  if (installBtn) installBtn.classList.remove('hidden');
});

// Click en “Instalar”
document.addEventListener('click', async (e) => {
  if (e.target && e.target.id === 'installButton' && deferredPrompt) {
    await deferredPrompt.prompt();
    deferredPrompt = null;
    e.target.classList.add('hidden');
  }
});

// --- Iconos SVG para reutilizar ---
const ICONS = {
    newRequest: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>`,
    newUser: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 11a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1v-1z" /></svg>`,
    dashboard: `<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V7a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>`,
    adminPanel: `<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`
};

// ---------- Utilidades de fecha (evitar desfases por zona horaria) ----------
function formatYMDToMX(ymd) {
    if (!ymd) return '';
    const clean = ymd.slice(0, 10); // soporta 'YYYY-MM-DD' o 'YYYY-MM-DDTHH:mm:ss'
    const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return ymd;
    const [, y, mo, d] = m;
    return `${d}/${mo}/${y}`;
}

async function checkSession() {
    try {
        const response = await fetch('/api/auth/check_session.php');
        const data = await response.json();
        if (data.loggedIn) {
            currentUser = data.user;
            paymentThreshold = data.config.paymentThreshold;
            document.getElementById('userName').textContent = currentUser.name;
            loadDashboard();
            setupPushNotifications();
        } else {
            window.location.href = 'inicio';
        }
    } catch (error) {
        console.error('Error de sesión, redirigiendo al login.', error);
        window.location.href = 'inicio';
    }
}

async function setupPushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Push notifications no son soportadas en este navegador.');
        return;
    }

    // IMPORTANTE: Reemplaza esto con la clave pública que generaste.
    const VAPID_PUBLIC_KEY = 'BHJZ3UZ0v9ZPcczVEm2KTP8r4BIk07zx97APHse7n-nLz-L7UbQZqRXU0gvDfmIUIb8QLku1wpeaMwtLrw9rm6o'; 
    if (VAPID_PUBLIC_KEY === 'Na3KOfiGrrOvE1cZMEjMnw5f_lMlN4-RHqeEIBCvkIc') {
        console.error('ERROR: No has configurado tu clave VAPID pública en app.js');
        return;
    }

    const container = document.getElementById('notification-bell-container');
    if (!container) return;

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    const updateUI = () => {
        if (Notification.permission === 'denied') {
            container.innerHTML = '<p class="text-xs text-red-500 dark:text-red-400">Notificaciones bloqueadas</p>';
            return;
        }

        if (subscription) {
            container.innerHTML = `<button id="bell-icon" title="Notificaciones activas" class="p-2 rounded-full bg-green-500 text-white shadow-lg animate-pulse">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
            </button>`;
        } else {
            container.innerHTML = `<button id="bell-icon" title="Activar notificaciones" class="p-2 rounded-full bg-gray-400 dark:bg-gray-600 text-white shadow-lg">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg>
            </button>`;
        }
    };

    container.addEventListener('click', async () => {
        if (subscription) {
            alert('Las notificaciones ya están activadas en este dispositivo.');
        } else {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                alert('Permiso de notificaciones no concedido.');
                return;
            }
            
            try {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: VAPID_PUBLIC_KEY
                });
                
                await fetch('/api/notifications/subscribe.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(subscription)
                });
                
                updateUI();
            } catch (error) {
                console.error('Error al suscribirse a las notificaciones:', error);
                alert('Hubo un error al activar las notificaciones.');
            }
        }
    });

    updateUI();
}

async function logout() {
    await fetch('/api/auth/logout.php');
    currentUser = null;
    window.location.href = 'inicio';
}


// --- Modal de autorización ---
function showAuthorizeRequestModal(request) {
    const modalContent = `
        <div class="bg-white dark:bg-gray-800 p-8 rounded-lg">
            <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2 border-b border-gray-200 dark:border-gray-700 pb-3">Autorizar Solicitud #${request.id}</h3>
            
            <div class="my-4 space-y-4 text-sm text-gray-700 dark:text-gray-300">
                <p><strong>Solicitante:</strong> ${request.creator_name}</p>
                <p><strong>Unidad de Negocio:</strong> ${request.business_unit_name}</p>
                <p><strong>Concepto de Pago:</strong> ${request.concepto_pago || 'No especificado'}</p>
                <p><strong>Monto:</strong> <span class="font-bold text-lg text-blue-800 dark:text-blue-300">$${parseFloat(request.amount).toFixed(2)}</span></p>
                <p><strong>Cotización:</strong> <a href="${request.quote_file_path}" target="_blank" class="text-blue-600 dark:text-blue-400 hover:underline">Ver Archivo Adjunto</a></p>
            </div>

            <form id="authorizeRequestForm" class="space-y-5">
                 <input type="hidden" id="request_id" value="${request.id}">
                 <div>
                    <label for="approver_comments" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Comentarios (Obligatorio si se rechaza o manda a corrección)</label>
                    <textarea id="approver_comments" rows="3" class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm dark:bg-gray-700 dark:text-gray-200"></textarea>
                 </div>
                 <p id="modal-error" class="text-red-600 text-sm text-center"></p>
                
                <div class="flex flex-col sm:flex-row sm:justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button type="button" id="cancelModalBtn" class="px-4 py-2 border rounded-md">Cancelar</button>
                    <button type="button" id="correctionBtnAction" class="action-btn px-5 py-2 rounded-md text-white bg-orange-500 hover:bg-orange-600">Mandar a Corrección</button>
                    <button type="button" id="rejectBtnAction" class="action-btn px-5 py-2 rounded-md text-white bg-red-600 hover:bg-red-700">Rechazar</button>
                    <button type="button" id="approveBtnAction" class="action-btn px-5 py-2 rounded-md text-white bg-green-600 hover:bg-green-700">Autorizar</button>
                </div>
            </form>
        </div>`;
    openModal(modalContent);

    document.getElementById('cancelModalBtn').addEventListener('click', closeModal);
    document.getElementById('approveBtnAction').addEventListener('click', () => submitAuthorization('Autorizado'));
    document.getElementById('rejectBtnAction').addEventListener('click', () => submitAuthorization('Rechazado'));
    // LISTENER AÑADIDO
    document.getElementById('correctionBtnAction').addEventListener('click', () => submitAuthorization('Correccion'));

    async function submitAuthorization(action) {
        const payload = {
            request_id: document.getElementById('request_id').value,
            action: action,
            comments: document.getElementById('approver_comments').value
        };

        const errorP = document.getElementById('modal-error');
        errorP.textContent = '';

        // VALIDACIÓN ACTUALIZADA
        if ((action === 'Rechazado' || action === 'Correccion') && !payload.comments) {
            errorP.textContent = 'Los comentarios son obligatorios para esta acción.';
            return;
        }

        const response = await fetch('/api/requests/authorize.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (response.ok) {
            closeModal();
            loadDashboard();
        } else {
            errorP.textContent = result.error;
        }
    }
}

function loadDashboard() {
    const content = document.getElementById('dashboard-content');
    content.innerHTML = '';
    switch (currentUser.role) {
        case 'Administrador':
            loadAdminDashboard(content);
            break;
        case 'Autorizador':
            loadApproverDashboard(content);
            break;
        case 'Tesoreria':
            loadTreasuryDashboard(content);
            break;
        case 'Compras':
            loadComprasDashboard(content); // Llamamos a la nueva función
            break;
        case 'Empleado':
            loadSolicitanteDashboard(content);
            break;
        default:
            content.innerHTML = `<p class="text-red-500 text-center text-lg mt-8">Error: Rol de usuario no reconocido.</p>`;
    }
}

function setupTabbedView(contentElement, headerHTML, tabs, defaultTab, hasFilters = false) {
    // 1) Pintar header como antes
    contentElement.innerHTML = headerHTML;

    // 2) Tomar contenedores ya existentes
    const tabsContainer = document.getElementById('tabsContainer');
    const requestsContainer = document.getElementById('requestsContainer');

    // 3) Estructura responsive: desktop tabs + mobile hamburger
    //    (No rompe tu maquetado: sólo anida dentro de #tabsContainer)
    tabsContainer.innerHTML = `
      <!-- Desktop: tabs tradicionales -->
      <div id="desktopTabs" class="hidden md:flex flex-wrap items-center gap-2"></div>

      <!-- Mobile: botón hamburguesa + panel -->
      <div id="mobileTabs" class="md:hidden relative">
        <button id="tabMenuBtn" type="button"
          class="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border
                 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z"/></svg>
          <span id="tabMenuLabel"></span>
        </button>
        <div id="tabMenuPanel"
             class="absolute z-30 mt-2 w-48 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg hidden">
          <ul id="tabMenuList" class="py-1"></ul>
        </div>
      </div>
    `;

    const desktopTabsDiv = document.getElementById('desktopTabs');
    const tabMenuBtn = document.getElementById('tabMenuBtn');
    const tabMenuLabel = document.getElementById('tabMenuLabel');
    const tabMenuPanel = document.getElementById('tabMenuPanel');
    const tabMenuList = document.getElementById('tabMenuList');

    // 4) Construir tabs (desktop) y opciones (mobile) manteniendo clases/estados originales
    tabs.forEach(tab => {
        // Botón de escritorio (con clase identificadora para no afectar el menú móvil)
        const tabButton = document.createElement('button');
        tabButton.textContent = tab;
        tabButton.dataset.status = tab === "Todas" ? "" : tab;
        tabButton.className = "tab-btn-desktop px-3 py-2 text-sm font-medium rounded-t-lg transition-colors duration-200 focus:outline-none";
        if (tab === defaultTab) {
            tabButton.classList.add('bg-white', 'dark:bg-gray-800', 'text-blue-700', 'dark:text-white');
        } else {
            tabButton.classList.add('text-white', 'opacity-70', 'hover:opacity-100');
        }
        desktopTabsDiv.appendChild(tabButton);

        // Ítem de menú móvil
        const li = document.createElement('li');
        const mobileBtn = document.createElement('button');
        mobileBtn.type = 'button';
        mobileBtn.dataset.status = tab === "Todas" ? "" : tab;
        mobileBtn.textContent = tab;
        mobileBtn.className = `w-full text-left px-3 py-2 text-sm ${
          tab === defaultTab
            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
            : 'text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
        }`;
        li.appendChild(mobileBtn);
        tabMenuList.appendChild(li);
    });

    // Helpers para activar estado sincronizado (desktop + mobile)
    const setActiveDesktop = (status) => {
        const buttons = desktopTabsDiv.querySelectorAll('.tab-btn-desktop');
        buttons.forEach(btn => {
            const isActive = btn.dataset.status === status;
            btn.classList.toggle('bg-white', isActive);
            btn.classList.toggle('dark:bg-gray-800', isActive);
            btn.classList.toggle('text-blue-700', isActive);
            btn.classList.toggle('dark:text-white', isActive);
            btn.classList.toggle('text-white', !isActive);
            btn.classList.toggle('opacity-70', !isActive);
            btn.classList.toggle('hover:opacity-100', !isActive);
        });
    };
    const setActiveMobile = (status) => {
        tabMenuLabel.textContent = (status === '' ? 'Todas' : status);
        tabMenuList.querySelectorAll('button').forEach(i => {
            const isActive = i.dataset.status === status;
            i.classList.toggle('bg-blue-50', isActive);
            i.classList.toggle('dark:bg-blue-900/30', isActive);
            i.classList.toggle('text-blue-700', isActive);
            i.classList.toggle('dark:text-blue-300', isActive);
            i.classList.toggle('text-gray-800', !isActive);
            i.classList.toggle('dark:text-gray-200', !isActive);
            i.classList.toggle('hover:bg-gray-50', !isActive);
            i.classList.toggle('dark:hover:bg-gray-700', !isActive);
        });
    };
    const getActiveStatus = () => {
        const activeDesktop = desktopTabsDiv.querySelector('.tab-btn-desktop.bg-white');
        return activeDesktop ? activeDesktop.dataset.status : (defaultTab === 'Todas' ? '' : defaultTab);
    };
    const togglePanel = (open) => {
        if (typeof open === 'boolean') {
            tabMenuPanel.classList.toggle('hidden', !open);
        } else {
            tabMenuPanel.classList.toggle('hidden');
        }
    };

    // 5) Tu lógica original de fetch/render (sin tocar)
    const fetchAndRender = async () => {
        requestsContainer.innerHTML = `<p class="text-center text-gray-500 dark:text-gray-400">Buscando...</p>`;
        const activeStatus = getActiveStatus();

        const searchInput = document.getElementById('searchInput');
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');

        const params = new URLSearchParams({
            status: activeStatus,
            search: searchInput ? searchInput.value : '',
            startDate: startDateInput ? startDateInput.value : '',
            endDate: endDateInput ? endDateInput.value : ''
        });

        const requests = await fetchData(`/api/requests/read.php?${params.toString()}`);
        
        let finalHTML = '';
        if (requests) {
            if (currentUser.role === 'Autorizador') {
                const totalAmount = requests.reduce((sum, req) => sum + parseFloat(req.amount), 0);
                const formattedTotal = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalAmount);
                finalHTML += `<div class="flex justify-end items-center mb-4 pr-2">
                                <span class="text-lg font-medium text-gray-600 dark:text-gray-300 mr-2">Total Filtrado:</span>
                                <span class="text-2xl font-bold text-gray-900 dark:text-white">${formattedTotal}</span>
                              </div>`;
            }
            finalHTML += renderRequestsTable(requests, currentUser.role === 'Tesoreria', currentUser.role === 'Autorizador', currentUser.role === 'Compras');
        } else {
            finalHTML = `<p class="text-center text-red-500">Error al cargar las solicitudes.</p>`;
        }
        requestsContainer.innerHTML = finalHTML;
    };

    // 6) Listeners DESKTOP (adaptación mínima sobre tu handler original)
    tabsContainer.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' && e.target.classList.contains('tab-btn-desktop')) {
            // Limpiar estilos en botones desktop solamente
            desktopTabsDiv.querySelectorAll('.tab-btn-desktop').forEach(btn => {
                btn.classList.remove('bg-white', 'dark:bg-gray-800', 'text-blue-700', 'dark:text-white');
                btn.classList.add('text-white', 'opacity-70', 'hover:opacity-100');
            });
            // Activar el seleccionado
            e.target.classList.add('bg-white', 'dark:bg-gray-800', 'text-blue-700', 'dark:text-white');
            e.target.classList.remove('text-white', 'opacity-70', 'hover:opacity-100');

            // Reflejar en móvil y renderizar
            setActiveMobile(e.target.dataset.status);
            fetchAndRender();
        }
    });

    // 7) Listeners MOBILE
    tabMenuBtn.addEventListener('click', () => togglePanel());
    tabMenuList.querySelectorAll('button').forEach(item => {
        item.addEventListener('click', () => {
            const status = item.dataset.status;
            setActiveDesktop(status);
            setActiveMobile(status);
            togglePanel(false);
            fetchAndRender();
        });
    });

    // Cerrar panel al hacer click fuera o con ESC
    document.addEventListener('click', (e) => {
        if (!tabMenuPanel.classList.contains('hidden')) {
            if (!tabMenuPanel.contains(e.target) && !tabMenuBtn.contains(e.target)) {
                togglePanel(false);
            }
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') togglePanel(false);
    });

    // 8) Inicialización
    setActiveDesktop(defaultTab === 'Todas' ? '' : defaultTab);
    setActiveMobile(defaultTab === 'Todas' ? '' : defaultTab);
    fetchAndRender();

    // 9) Filtros (idéntico a tu código)
    if (hasFilters) {
        let searchTimeout;
        ['searchInput', 'startDate', 'endDate'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('input', () => {
                    clearTimeout(searchTimeout);
                    searchTimeout = setTimeout(fetchAndRender, 300);
                });
            }
        });
    }
}

// -----------------------------------------
// --- DASHBOARD: UNIDAD DE NEGOCIO --------
// -----------------------------------------
async function loadSolicitanteDashboard(content) {
    const budgetData = await fetchData(`/api/data/get_budget.php?unit_id=${currentUser.business_unit_id}`);
    const remainingBudget = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(budgetData.budget_remaining || 0);

    const headerHTML = `
        <div class="bg-gradient-to-r from-blue-700 to-blue-800 p-6 rounded-lg shadow-lg mb-8 text-white">
            <div class="flex justify-between items-start">
                <div class="flex items-center">
                    ${ICONS.dashboard}
                    <div><h2 class="text-2xl font-bold">Mis Solicitudes</h2><p class="text-blue-200">Panel de Solicitante</p></div>
                </div>
                <div class="text-right">
                    <div class="text-lg font-semibold">${remainingBudget}</div>
                    <div class="text-sm text-blue-200">Presupuesto Diario Restante</div>
                </div>
            </div>
            <div class="mt-4 flex justify-between items-center">
                 <div id="tabsContainer" class="flex space-x-1 border-b border-blue-600"></div>
                 <button id="newRequestBtn" class="bg-white hover:bg-gray-200 dark:bg-gray-100 dark:hover:bg-gray-200 text-blue-700 font-semibold py-2 px-4 rounded-lg shadow-md flex items-center">${ICONS.newRequest} Nueva Solicitud</button>
            </div>
        </div>
        <div id="requestsContainer"></div>`;
    
    setupTabbedView(content, headerHTML, ["Todas", "Pendiente", "Correccion", "Autorizado", "Pagado", "Rechazado"], "Todas");
    document.getElementById('newRequestBtn').addEventListener('click', showNewRequestModal);
}

async function loadApproverDashboard(content) {
    const headerHTML = `
        <div class="bg-gradient-to-r from-teal-600 to-teal-700 p-6 rounded-lg shadow-lg mb-8 text-white">
            <div class="flex items-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <div><h2 class="text-2xl font-bold">Solicitudes para Autorización</h2><p class="text-teal-200">Panel de Autorizador</p></div>
            </div>
            <div id="tabsContainer" class="flex space-x-1 border-b border-teal-500"></div>
            
            <div class="flex flex-col md:flex-row md:items-end gap-4 mt-4">
                
                <div class="flex flex-col sm:flex-row gap-4 w-full md:w-2/3">
                    <div class="w-full sm:w-1/2">
                        <label for="startDate" class="block text-sm font-medium text-teal-200 mb-1">Fecha Inicio</label>
                        <input type="date" id="startDate" class="w-full text-center px-0 py-2 rounded-lg shadow-inner text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700">
                    </div>
                    <div class="w-full sm:w-1/2">
                        <label for="endDate" class="block text-sm font-medium text-teal-200 mb-1">Fecha Fin</label>
                        <input type="date" id="endDate" class="w-full text-center px-0 py-2 rounded-lg shadow-inner text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700">
                    </div>
                </div>

                <div class="w-full md:w-1/3">
                    <label for="searchInput" class="block text-sm font-medium text-teal-200 mb-1">Búsqueda General</label>
                    <input type="search" id="searchInput" class="w-full px-4 py-2 rounded-lg shadow-inner text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700" placeholder="Buscar...">
                </div>
            </div>
            </div>
        <div id="requestsContainer"></div>`;

    // Se pasa "Pendiente" como la pestaña por defecto
    setupTabbedView(content, headerHTML, ["Pendiente", "Todas", "Correccion", "Autorizado", "Pagado", "Rechazado"], "Pendiente", true);
}



async function loadTreasuryDashboard(content) {
    const headerHTML = `
        <div class="bg-gradient-to-r from-purple-700 to-purple-800 p-6 rounded-lg shadow-lg mb-8 text-white">
            <div class="flex items-center mb-4">
                ${ICONS.dashboard}
                <div><h2 class="text-2xl font-bold">Historial de Solicitudes</h2><p class="text-purple-200">Panel de Tesorería</p></div>
            </div>
            <div id="tabsContainer" class="flex space-x-1 border-b border-purple-600 mt-4"></div>
             <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mt-4">
                <div><label for="startDate" class="block text-sm font-medium text-purple-200 mb-1">Fecha Inicio</label><input type="date" id="startDate" class="w-full px-0 py-2 rounded-lg shadow-inner text-center text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700"></div>
                <div><label for="endDate" class="block text-sm font-medium text-purple-200 mb-1">Fecha Fin</label><input type="date" id="endDate" class="w-full px-0 py-2 rounded-lg shadow-inner text-center text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700"></div>
                <div><label for="searchInput" class="block text-sm font-medium text-purple-200 mb-1">Búsqueda General</label><input type="search" id="searchInput" class="w-full px-4 py-2 rounded-lg shadow-inner text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700" placeholder="Buscar..."></div>
            </div>
        </div>
        <div id="requestsContainer"></div>`;
    
    setupTabbedView(content, headerHTML, ["Autorizado", "Pendiente", "Correccion", "Pagado", "Rechazado", "Todas"], "Autorizado", true);
}

// -----------------------------------------
// --- DASHBOARD: ADMINISTRADOR ------------
// -----------------------------------------
async function loadAdminDashboard(content) {
    // 1. ESTRUCTURA HTML (HEADER CON PESTAÑAS Y FILTROS + CONTENEDOR)
    const dashboardHTML = `
        <div class="bg-gradient-to-r from-gray-700 to-gray-800 p-6 rounded-lg shadow-lg mb-8 text-white">
            <div class="flex justify-between items-start flex-wrap gap-4">
                <div class="flex items-center">
                    ${ICONS.adminPanel}
                    <div>
                        <h2 class="text-2xl font-bold">Panel de Administración</h2>
                        <p class="text-gray-300">Gestión del Sistema</p>
                    </div>
                </div>
                <div class="flex items-center flex-shrink-0">
                    <button id="newRequestBtn" class="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-5 rounded-lg shadow-md transition duration-300 ease-in-out flex items-center mr-4">${ICONS.newRequest} Nueva Solicitud</button>
                    
                </div>
                <div class="flex items-center flex-shrink-0">
                    <button id="newUserBtn" class="bg-white hover:bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out flex items-center">${ICONS.newUser} Nuevo Usuario</button>
                </div>
        </div>
            
            <div id="adminTabsContainer" class="flex space-x-1 border-b border-gray-500 mt-6">
                </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mt-4">
                <div>
                    <label for="startDate" class="block text-sm font-medium text-gray-200 mb-1">Fecha Inicio</label>
                    <input type="date" id="startDate" class="w-full px-0 py-2 rounded-lg shadow-inner text-gray-800 bg-gray-100 dark:bg-gray-600 text-center dark:text-gray-200 border-transparent focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                </div>
                <div>
                    <label for="endDate" class="block text-sm font-medium text-gray-200 mb-1">Fecha Fin</label>
                    <input type="date" id="endDate" class="w-full px-0 py-2 rounded-lg shadow-inner text-gray-800 bg-gray-100 dark:bg-gray-600 text-center dark:text-gray-200 border-transparent focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                </div>
                <div>
                    <label for="searchInput" class="block text-sm font-medium text-gray-200 mb-1">Búsqueda General</label>
                    <input type="search" id="searchInput" class="w-full px-4 py-2 rounded-lg shadow-inner text-gray-800 bg-gray-100 dark:bg-gray-600 dark:text-gray-200 border-transparent focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Buscar...">
                </div>
            </div>
        </div>

        <div id="adminContentContainer" class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            </div>
    `;
    content.innerHTML = dashboardHTML;

    // 2. LÓGICA DE PESTAÑAS Y RENDERIZADO
    const tabsContainer = document.getElementById('adminTabsContainer');
    const contentContainer = document.getElementById('adminContentContainer');
    const searchInput = document.getElementById('searchInput');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');

    let activeTab = 'users'; // Pestaña por defecto

    const tabs = [
        { id: 'users', name: 'Gestión de Usuarios' },
        { id: 'requests', name: 'Todas las Solicitudes' }
    ];

    // Función principal para cargar el contenido de la pestaña activa
    const renderActiveTabContent = async () => {
        contentContainer.innerHTML = '<div class="text-center py-10"><p>Cargando datos...</p></div>'; // Indicador de carga
        
        const searchValue = searchInput.value;
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        try {
            if (activeTab === 'users') {
                // Para la pestaña de usuarios, los filtros de fecha no aplican
                document.getElementById('startDate').disabled = true;
                document.getElementById('endDate').disabled = true;
                const users = await fetchData(`/api/users/read.php?search=${encodeURIComponent(searchValue)}`);
                contentContainer.innerHTML = `<h3 class="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 border-b border-gray-200 dark:border-gray-700 pb-3">Gestión de Usuarios</h3>${renderUsersTable(users)}`;
            } else if (activeTab === 'requests') {
                // Para la pestaña de solicitudes, todos los filtros aplican
                 document.getElementById('startDate').disabled = false;
                 document.getElementById('endDate').disabled = false;
                const requests = await fetchData(`/api/requests/read.php?view_all=true&search=${encodeURIComponent(searchValue)}&start_date=${startDate}&end_date=${endDate}`);
                contentContainer.innerHTML = `<h3 class="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 border-b border-gray-200 dark:border-gray-700 pb-3">Todas las Solicitudes</h3>${renderRequestsTable(requests)}`;
            }
        } catch (error) {
            contentContainer.innerHTML = `<div class="text-center py-10 text-red-500"><p>Error al cargar los datos: ${error.message}</p></div>`;
        }
    };
    
    // Generar las pestañas y añadir listeners
    tabs.forEach(tab => {
        const tabElement = document.createElement('button');
        tabElement.textContent = tab.name;
        tabElement.className = `py-2 px-4 text-sm font-medium rounded-t-lg transition-colors duration-300`;
        tabElement.dataset.tabId = tab.id;

        if (tab.id === activeTab) {
            tabElement.classList.add('bg-white', 'dark:bg-gray-800', 'text-blue-600', 'dark:text-blue-400');
        } else {
            tabElement.classList.add('text-gray-200', 'hover:bg-gray-600/50');
        }
        
        tabElement.addEventListener('click', () => {
            activeTab = tab.id;
            // Actualizar estilos de todas las pestañas
            tabsContainer.querySelectorAll('button').forEach(btn => {
                if (btn.dataset.tabId === activeTab) {
                    btn.className = 'py-2 px-4 text-sm font-medium rounded-t-lg transition-colors duration-300 bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400';
                } else {
                    btn.className = 'py-2 px-4 text-sm font-medium rounded-t-lg transition-colors duration-300 text-gray-200 hover:bg-gray-600/50';
                }
            });
            renderActiveTabContent();
        });

        tabsContainer.appendChild(tabElement);
    });

    // 3. EVENT LISTENERS PARA FILTROS Y BOTONES
    document.getElementById('newUserBtn').addEventListener('click', showNewUserModal);
    document.getElementById('newRequestBtn').addEventListener('click', showNewRequestModal);
    
    // Recargar contenido al cambiar filtros
    searchInput.addEventListener('input', renderActiveTabContent);
    startDateInput.addEventListener('change', renderActiveTabContent);
    endDateInput.addEventListener('change', renderActiveTabContent);

    // Carga inicial del contenido
    renderActiveTabContent();
}

async function loadComprasDashboard(content) {
    // Es una copia de loadTreasuryDashboard con textos y colores cambiados
    const headerHTML = `
        <div class="bg-gradient-to-r from-gray-600 to-gray-700 p-6 rounded-lg shadow-lg mb-8 text-white">
            <div class="flex items-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                <div><h2 class="text-2xl font-bold">Consulta de Solicitudes</h2><p class="text-gray-200">Panel de Compras (Solo Lectura)</p></div>
            </div>
            <div id="tabsContainer" class="flex space-x-1 border-b border-gray-500 mt-4"></div>
             <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mt-4">
                <div><label for="startDate" class="block text-sm font-medium text-gray-200 mb-1">Fecha Inicio</label><input type="date" id="startDate" class="w-full px-0 py-2 rounded-lg shadow-inner text-center text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700"></div>
                <div><label for="endDate" class="block text-sm font-medium text-gray-200 mb-1">Fecha Fin</label><input type="date" id="endDate" class="w-full px-0 py-2 rounded-lg shadow-inner text-center text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700"></div>
                <div><label for="searchInput" class="block text-sm font-medium text-gray-200 mb-1">Búsqueda General</label><input type="search" id="searchInput" class="w-full px-4 py-2 rounded-lg shadow-inner text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700" placeholder="Buscar..."></div>
            </div>
        </div>
        <div id="requestsContainer"></div>`;
    
    // Usamos las mismas pestañas que Tesorería, empezando por "Autorizado"
    setupTabbedView(content, headerHTML, ["Autorizado", "Pendiente", "Correccion", "Pagado", "Rechazado", "Todas"], "Pagado", true);
}

async function showNewRequestModal() {
    const formData = await fetchData('/api/data/get_form_data_v3.php');
    if (!formData) {
        alert('No se pudieron cargar los datos para el formulario. Intente de nuevo.');
        return;
    }
    const unitOptions = formData.business_units.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
    const tipoGastoOptions = formData.tipos_gasto.map(tg => `<option value="${tg.id}">${tg.name}</option>`).join('');
    const modalContent = `
        <div class="bg-white dark:bg-gray-800 p-8 rounded-lg">
            <h3 class="text-xl ...">Nueva Solicitud de Pago</h3>
            <form id="newRequestForm" class="space-y-5">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div><label for="business_unit_id" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unidad de Negocio</label><select id="business_unit_id" name="business_unit_id" class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 rounded-md shadow-sm" required><option value="">-- Seleccione una unidad --</option>${unitOptions}</select></div>
                    <div><label for="razon_social_id" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Razón Social</label><select id="razon_social_id" name="razon_social_id" class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-200 rounded-md shadow-sm" required disabled><option value="">-- Primero seleccione una unidad --</option></select></div>
                    <div><label for="proveedor_id" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Proveedor</label><div class="flex items-center space-x-2"><select id="proveedor_id" name="proveedor_id" class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-200 rounded-md shadow-sm" required disabled><option value="">-- Primero seleccione una unidad --</option></select><button type="button" id="addProviderBtn" class="p-2 bg-green-500 hover:bg-green-600 text-white rounded-md shadow-sm" disabled>${ICONS.newRequest}</button></div></div>
                    <div><label for="banco" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Banco</label><select id="banco" name="banco" class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 rounded-md shadow-sm" required><option value="">-- Seleccione banco --</option><option value="Fiscal">Fiscal</option><option value="Principal">Principal</option><option value="Exclusivo tesorería">Exclusivo tesorería</option></select></div>
                    <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cuenta</label><input type="text" id="proveedor_cuenta" class="block w-full px-3 py-2 border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-200" readonly></div>
                    <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Referencia</label><input type="text" id="proveedor_referencia" class="block w-full px-3 py-2 border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-200" readonly></div>
                    <div><label for="tipo_gasto_id" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de Gasto</label><select id="tipo_gasto_id" name="tipo_gasto_id" class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 rounded-md shadow-sm" required><option value="">-- Seleccione un tipo --</option>${tipoGastoOptions}</select></div>
                    <div><label for="concepto_id" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gasto</label><select id="concepto_id" name="concepto_id" class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-200 rounded-md shadow-sm" required disabled><option value="">-- Primero seleccione un tipo de gasto --</option></select></div>
                </div>
                <div><label for="concepto_pago" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Concepto de Pago</label><textarea id="concepto_pago" name="concepto_pago" rows="2" class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 rounded-md shadow-sm" required></textarea></div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div><label for="amount" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Monto ($)</label><input type="number" step="0.01" id="amount" name="amount" class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 rounded-md shadow-sm" required></div>
                    <div><label for="deadline" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha Límite</label><input type="date" id="deadline" name="deadline" class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 rounded-md shadow-sm" required></div>
                </div>
                <div><label for="quote_file" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Adjuntar Cotización</label><input type="file" id="quote_file" name="quote_file" class="block w-full text-sm text-gray-800 dark:text-gray-200 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 dark:file:bg-gray-600 dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-gray-500" required></div>
                <p id="modal-error" class="text-red-500 text-sm text-center pt-2"></p>
                <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button type="button" id="cancelModalBtn" class="px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-200">Cancelar</button>
                    <button type="submit" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md">Enviar Solicitud</button>
                </div>
            </form>
        </div>`;
    openModal(modalContent);
    const unitSelect = document.getElementById('business_unit_id');
    const providerSelect = document.getElementById('proveedor_id');
    const razonSocialSelect = document.getElementById('razon_social_id');
    const cuentaInput = document.getElementById('proveedor_cuenta');
    const referenciaInput = document.getElementById('proveedor_referencia');
    const addProviderBtn = document.getElementById('addProviderBtn');
    const tipoGastoSelect = document.getElementById('tipo_gasto_id');
    const conceptoSelect = document.getElementById('concepto_id');
    unitSelect.addEventListener('change', () => {
        const selectedUnitId = unitSelect.value;
        providerSelect.innerHTML = '<option value="">-- Cargando... --</option>';
        razonSocialSelect.innerHTML = '<option value="">-- Cargando... --</option>';
        cuentaInput.value = '';
        referenciaInput.value = '';
        if (!selectedUnitId) {
            providerSelect.innerHTML = '<option value="">-- Seleccione unidad --</option>';
            providerSelect.disabled = true;
            razonSocialSelect.innerHTML = '<option value="">-- Seleccione unidad --</option>';
            razonSocialSelect.disabled = true;
            addProviderBtn.disabled = true;
            return;
        }
        const availableProviders = formData.providers.filter(p => p.business_unit_id == selectedUnitId);
        if (availableProviders.length > 0) {
            providerSelect.innerHTML = '<option value="">-- Seleccione proveedor --</option>' + availableProviders.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
            providerSelect.disabled = false;
        } else {
            providerSelect.innerHTML = '<option value="">-- No hay proveedores --</option>';
            providerSelect.disabled = true;
        }
        addProviderBtn.disabled = false;
        const availableReasons = formData.razones_sociales.filter(r => r.business_unit_id == selectedUnitId);
        if (availableReasons.length > 0) {
            razonSocialSelect.innerHTML = '<option value="">-- Seleccione razón social --</option>' + availableReasons.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
            razonSocialSelect.disabled = false;
        } else {
            razonSocialSelect.innerHTML = '<option value="">-- No hay razones sociales --</option>';
            razonSocialSelect.disabled = true;
        }
    });
    providerSelect.addEventListener('change', () => {
        const selectedProviderId = providerSelect.value;
        const providerData = formData.providers.find(p => p.id == selectedProviderId);
        if (providerData) {
            cuentaInput.value = providerData.account || '';
            referenciaInput.value = providerData.reference || '';
        } else {
            cuentaInput.value = '';
            referenciaInput.value = '';
        }
    });
    addProviderBtn.addEventListener('click', () => {
        const selectedUnitId = unitSelect.value;
        showAddProviderModal(selectedUnitId, (newProvider) => {
            formData.providers.push(newProvider);
            const newOption = new Option(newProvider.name, newProvider.id, true, true);
            providerSelect.add(newOption);
            providerSelect.dispatchEvent(new Event('change'));
        });
    });
    tipoGastoSelect.addEventListener('change', () => {
        const selectedTipoId = tipoGastoSelect.value;
        conceptoSelect.innerHTML = '<option value="">-- Cargando... --</option>';
        if (!selectedTipoId) {
            conceptoSelect.innerHTML = '<option value="">-- Primero seleccione un tipo de gasto --</option>';
            conceptoSelect.disabled = true;
            return;
        }
        const availableConceptos = formData.conceptos.filter(c => c.tipo_gasto_id == selectedTipoId);
        if (availableConceptos.length > 0) {
            conceptoSelect.innerHTML = '<option value="">-- Seleccione un concepto --</option>' + availableConceptos.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
            conceptoSelect.disabled = false;
        } else {
            conceptoSelect.innerHTML = '<option value="">-- No hay conceptos para este tipo --</option>';
            conceptoSelect.disabled = true;
        }
    });
    document.getElementById('cancelModalBtn').addEventListener('click', closeModal);
    document.getElementById('newRequestForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Enviando...';
        const formData = new FormData(form);
        const dateInput = document.getElementById('deadline');
        if (dateInput.value) {
            formData.set('deadline', dateInput.value);
        }
        const response = await fetch('/api/requests/create.php', { method: 'POST', body: formData });
        const result = await response.json();
        if (response.ok) {
            closeModal();
            loadDashboard();
        } else {
            document.getElementById('modal-error').textContent = result.error || 'Error al enviar la solicitud.';
            submitButton.disabled = false;
            submitButton.textContent = 'Enviar Solicitud';
        }
    });
}

function showAddProviderModal(businessUnitId, onSuccessCallback) {
    const subModalContent = `
        <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl relative">
            <h4 class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Añadir Nuevo Proveedor</h4>
            <form id="addProviderForm" class="space-y-4">
                <input type="hidden" id="provider_unit_id" value="${businessUnitId}">
                <div>
                    <label for="provider_name" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre del Proveedor</label>
                    <input type="text" id="provider_name" class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" required>
                </div>
                <div>
                    <label for="provider_account" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Cuenta Bancaria</label>
                    <input type="text" id="provider_account" class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" required>
                </div>
                <div>
                    <label for="provider_reference" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Referencia</label>
                    <input type="text" id="provider_reference" class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200" required>
                </div>
                <p id="sub-modal-error" class="text-red-600 text-sm"></p>
                <div class="flex justify-end gap-3 pt-4">
                    <button type="button" id="cancelSubModalBtn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 rounded-md">Cancelar</button>
                    <button type="submit" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md">Guardar Proveedor</button>
                </div>
            </form>
        </div>
    `;

    const subModalContainer = document.createElement('div');
    subModalContainer.id = 'sub-modal-container';
    subModalContainer.className = 'absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    subModalContainer.innerHTML = subModalContent;
    document.getElementById('modal-content').appendChild(subModalContainer);

    document.getElementById('cancelSubModalBtn').addEventListener('click', () => {
        subModalContainer.remove();
    });

    document.getElementById('addProviderForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            name: document.getElementById('provider_name').value,
            account: document.getElementById('provider_account').value,
            reference: document.getElementById('provider_reference').value,
            business_unit_id: document.getElementById('provider_unit_id').value,
        };
        
        const response = await fetch('/api/providers/create.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (response.ok) {
            onSuccessCallback(result.new_provider);
            subModalContainer.remove();
        } else {
            document.getElementById('sub-modal-error').textContent = result.error;
        }
    });
}

function showPaymentModal(request) {
    const modalContent = `
        <div class="bg-white dark:bg-gray-800 p-8 rounded-lg">
            <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2 border-b border-gray-200 dark:border-gray-700 pb-3">Procesar Pago de Solicitud #${request.id}</h3>
            <div class="my-4 space-y-4 text-sm text-gray-700 dark:text-gray-300">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <p><strong>Solicitante:</strong> ${request.creator_name}</p>
                        <p><strong>Unidad:</strong> ${request.business_unit_name}</p>
                        <p><strong>Razón Social:</strong> ${request.razon_social_name}</p>
                        <p><strong>Banco:</strong> <span class="font-semibold text-blue-600 dark:text-blue-400">${request.banco}</span></p>
                        </div>
                    <div>
                        <p class="font-semibold text-gray-800 dark:text-gray-100">Datos del Proveedor:</p>
                        <p><strong>Nombre:</strong> ${request.provider_name}</p>
                        <p><strong>Cuenta:</strong> ${request.provider_account || 'No especificada'}</p>
                        <p><strong>Referencia:</strong> ${request.provider_reference || 'No especificada'}</p>
                    </div>
                </div>
                <hr class="my-4 border-gray-200 dark:border-gray-700">
                <p><strong>Concepto de Pago:</strong> ${request.concepto_pago || 'No especificado'}</p>
                <p><strong>Descripción Adicional:</strong> ${request.concept || 'Ninguna'}</p>
                <p><strong>Monto a Pagar:</strong> <span class="font-bold text-2xl text-green-700 dark:text-green-300">$${parseFloat(request.amount).toFixed(2)}</span></p>
                <p><strong>Comentarios del Autorizador:</strong> <span class="italic text-gray-600 dark:text-gray-300">${request.approver_comments || 'N/A'}</span></p>
                <p><strong>Cotización:</strong> <a href="${request.quote_file_path}" target="_blank" class="text-blue-600 dark:text-blue-400 hover:underline">Ver Archivo Adjunto</a></p>
            </div>
            <form id="paymentForm" class="space-y-5">
                 <input type="hidden" name="request_id" value="${request.id}">
                 <div class="border border-green-200 dark:border-green-800 p-4 rounded-md bg-green-50 dark:bg-green-900/50">
                    <label for="payment_proof" class="block text-sm font-medium text-green-700 dark:text-green-300 mb-1">Adjuntar Comprobante de Pago (Obligatorio)</label>
                    <input type="file" name="payment_proof" class="block w-full text-sm text-green-800 dark:text-green-200 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-100 dark:file:bg-green-700 hover:file:bg-green-200 dark:hover:file:bg-green-600 cursor-pointer" required>
                 </div>
                 <p id="modal-error" class="text-red-500 text-sm text-center"></p>
                 <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button type="button" id="cancelModalBtn" class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">Cancelar</button>
                    <button type="submit" class="px-5 py-2 border-transparent rounded-md text-white bg-green-600 hover:bg-green-700">Confirmar Pago</button>
                </div>
            </form>
        </div>`;
    openModal(modalContent);
    document.getElementById('cancelModalBtn').addEventListener('click', closeModal);
    document.getElementById('paymentForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.innerHTML = 'Procesando...';
        const formData = new FormData(form);
        const response = await fetch('/api/requests/pay.php', { method: 'POST', body: formData });
        const result = await response.json();
        if (response.ok) {
            closeModal();
            loadDashboard();
        } else {
            document.getElementById('modal-error').textContent = result.error;
            submitButton.disabled = false;
            submitButton.innerHTML = 'Confirmar Pago';
        }
    });
}

function showTreasuryActionModal(request) {
    const modalContent = `
        <div class="bg-white dark:bg-gray-800 p-4 sm:p-6 md:p-8 rounded-lg w-full max-w-2xl">
            <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2 border-b border-gray-200 dark:border-gray-700 pb-3">Revisión de Tesorería - Solicitud #${request.id}</h3>
            <div class="my-4 space-y-4 text-sm text-gray-700 dark:text-gray-300">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <p><strong>Solicitante:</strong> ${request.creator_name}</p>
                        <p><strong>Unidad:</strong> ${request.business_unit_name}</p>
                        <p><strong>Razón Social:</strong> ${request.razon_social_name}</p>
                        <p><strong>Banco:</strong> <span class="font-semibold text-blue-600 dark:text-blue-400">${request.banco}</span></p>
                    </div>
                    <div>
                        <p class="font-semibold text-gray-800 dark:text-gray-100">Datos del Proveedor:</p>
                        <p><strong>Nombre:</strong> ${request.provider_name}</p>
                        <p><strong>Cuenta:</strong> ${request.provider_account || 'N/A'}</p>
                        <p><strong>Referencia:</strong> ${request.provider_reference || 'N/A'}</p>
                    </div>
                </div>
                <hr class="my-4 border-gray-200 dark:border-gray-700">
                <p><strong>Concepto de Pago:</strong> ${request.concepto_pago || 'N/A'}</p>
                <p><strong>Monto a Pagar:</strong> <span class="font-bold text-xl sm:text-2xl text-green-700 dark:text-green-300">$${parseFloat(request.amount).toFixed(2)}</span></p>
                <p><strong>Comentarios del Autorizador:</strong> <span class="italic text-gray-600 dark:text-gray-300">${request.approver_comments || 'N/A'}</span></p>
                <p><strong>Cotización:</strong> <a href="${request.quote_file_path}" target="_blank" class="text-blue-600 dark:text-blue-400 hover:underline">Ver Archivo Adjunto</a></p>
            </div>
            <form id="treasuryActionForm">
                <input type="hidden" name="request_id" value="${request.id}">
                <div id="payment-section" class="hidden space-y-2 border p-4 rounded-md bg-green-50 dark:bg-green-900/50">
                    <label for="payment_proof" class="block text-sm font-medium text-green-700 dark:text-green-300">Adjuntar Comprobante de Pago</label>
                    <input type="file" name="payment_proof" class="block w-full text-sm">
                </div>
                <div id="comments-section" class="hidden space-y-2 border p-4 rounded-md bg-orange-50 dark:bg-orange-900/50">
                    <label for="comments" class="block text-sm font-medium text-orange-700 dark:text-orange-300">Motivo (Obligatorio)</label>
                    <textarea name="comments" rows="3" class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm"></textarea>
                </div>
                <p id="modal-error" class="text-red-600 text-sm text-center pt-2"></p>
                
                <div class="flex flex-col sm:flex-row sm:justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button type="button" id="cancelModalBtn" class="px-4 py-2 border rounded-md">Cancelar</button>
                    <button type="button" data-action="Correccion" class="action-btn px-5 py-2 rounded-md text-white bg-orange-500 hover:bg-orange-600">Mandar a Corrección</button>
                    <button type="button" data-action="Rechazado" class="action-btn px-5 py-2 rounded-md text-white bg-red-600 hover:bg-red-700">Rechazar</button>
                    <button type="button" data-action="Pagado" class="action-btn px-5 py-2 rounded-md text-white bg-green-600 hover:bg-green-700">Pagar</button>
                </div>
            </form>
        </div>`;
    openModal(modalContent);
    
    const form = document.getElementById('treasuryActionForm');
    const paymentSection = document.getElementById('payment-section');
    const commentsSection = document.getElementById('comments-section');

    form.querySelectorAll('.action-btn').forEach(button => {
        button.addEventListener('click', async (e) => {
            const action = e.currentTarget.dataset.action;
            if (action === 'Pagado') {
                paymentSection.classList.remove('hidden');
                commentsSection.classList.add('hidden');
                if (form.payment_proof.files.length === 0) {
                    document.getElementById('modal-error').textContent = 'El comprobante de pago es obligatorio.';
                    return;
                }
            } else if (action === 'Rechazado' || action === 'Correccion') {
                commentsSection.classList.remove('hidden');
                paymentSection.classList.add('hidden');
                if (form.comments.value.trim() === '') {
                    document.getElementById('modal-error').textContent = 'Los comentarios son obligatorios para esta acción.';
                    return;
                }
            }
            const submitButton = e.currentTarget;
            submitButton.disabled = true;
            submitButton.textContent = 'Procesando...';
            
            const formData = new FormData(form);
            formData.append('action', action);

            const response = await fetch('/api/requests/treasury_action.php', { method: 'POST', body: formData });
            const result = await response.json();

            if (response.ok) {
                closeModal();
                loadDashboard();
            } else {
                document.getElementById('modal-error').textContent = result.error;
                submitButton.disabled = false;
                submitButton.textContent = action.charAt(0).toUpperCase() + action.slice(1);
            }
        });
    });

    document.getElementById('cancelModalBtn').addEventListener('click', closeModal);
}
async function showNewUserModal() {
    // La lógica para obtener los datos no cambia
    const formData = await fetchData('/api/users/read.php?action=get_form_data');
    if (!formData) {
        alert('Error al cargar datos para el formulario de usuario.');
        return;
    }

    const roleOptions = formData.roles.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    const businessUnits = formData.business_units.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    // --- INICIO DE CAMBIOS DE ESTILO ---
    const modalContent = `
        <div class="bg-white dark:bg-gray-800 p-4 sm:p-6 lg:p-8 rounded-lg shadow-xl w-full max-w-2xl transform transition-all">
            <div class="flex items-center mb-6 pb-3 border-b border-gray-200 dark:border-gray-700">
                ${ICONS.newUser} <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Crear Nuevo Usuario</h3>
            </div>
            
            <form id="newUserForm" class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                    <div>
                        <label for="name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre Completo</label>
                        <input type="text" id="name" name="name" class="block w-full px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors" required placeholder="Nombre Apellido">
                    </div>
                    <div>
                        <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Correo Electrónico</label>
                        <input type="email" id="email" name="email" class="block w-full px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors" required placeholder="correo@empresa.com">
                    </div>
                    <div>
                        <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contraseña</label>
                        <input type="password" id="password" name="password" class="block w-full px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors" required minlength="8" placeholder="Mínimo 8 caracteres">
                    </div>
                    <div>
                        <label for="role" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rol</label>
                        <select id="role" name="role" class="block w-full px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors" required>${roleOptions}</select>
                    </div>
                </div>
                
                <div>
                    <label for="business_units" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unidad de negocio (Empleados)</label>
                    <select id="business_units" name="business_units" class="block w-full px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors" required>${businessUnits}</select>
                </div>
                <div>
                    <label for="team" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Equipo de Trabajo (Opcional)</label>
                    <input type="text" id="team" name="team" class="block w-full px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors" placeholder="Ej: Ventas GDL">
                </div>


                <p id="modal-error" class="text-red-600 dark:text-red-400 text-sm text-center h-4"></p>
                
                <div class="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button type="button" id="cancelModalBtn" class="px-5 py-2 rounded-md font-semibold text-sm text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 dark:focus:ring-offset-gray-800 transition-all">Cancelar</button>
                    <button type="submit" class="px-5 py-2 rounded-md font-semibold text-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 transition-all">Crear Usuario</button>
                </div>
            </form>
        </div>`;
    // --- FIN DE CAMBIOS DE ESTILO ---

    openModal(modalContent);
    
    // La lógica para manejar el formulario no cambia
    document.getElementById('cancelModalBtn').addEventListener('click', closeModal);
    document.getElementById('newUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const userData = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
            role_id: document.getElementById('role').value,
            business_unit_id: document.getElementById('business_units').value,
            team: document.getElementById('team').value
        };

        const response = await fetch('/api/users/create.php', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData) 
        });
        const result = await response.json();

        if (response.ok) {
            closeModal();
            loadDashboard();
        } else {
            document.getElementById('modal-error').textContent = result.error || 'Error al crear el usuario.';
        }
    });
}

function renderRequestsTable(requests, isTreasury = false, isApprover = false, isCompras = false) {
  if (!requests || requests.length === 0) {
    return `<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center text-gray-500">No hay solicitudes.</div>`;
  }

  // 1) Prepara los datos UNA vez y reutilízalos para tarjetas (móvil) y tabla (md+)
  const rowsData = requests.map(req => {
    const statusBadge = {
      'Pendiente': 'bg-yellow-100 text-yellow-800',
      'Correccion': 'bg-orange-100 text-orange-800',
      'Autorizado': 'bg-blue-100 text-blue-800',
      'Rechazado': 'bg-red-100 text-red-800',
      'Pagado': 'bg-green-100 text-green-800'
    }[req.status];

    let actionButton = '';
    const solicitantePuedePagar =
      (req.creator_role === 'Empleado' || req.creator_role === 'Administrador') &&
      req.status === 'Autorizado' &&
      req.banco === 'Fiscal' &&
      parseFloat(req.user_budget_remaining) >= parseFloat(req.amount);
      
    if (isCompras) {
        const quoteLink = req.quote_file_path ? `<a href="${req.quote_file_path}" target="_blank" class="text-blue-600 dark:text-blue-300 hover:underline text-xs font-medium">Ver Cotización</a>` : '';
        const paymentLink = req.payment_proof_path ? `<a href="${req.payment_proof_path}" target="_blank" class="text-green-600 dark:text-green-400 hover:underline text-xs font-medium">Ver Pago</a>` : '';
        
        // Unimos ambos enlaces si existen
        actionButton = [quoteLink, paymentLink].filter(Boolean).join('<span class="mx-1 text-gray-400">|</span>');


    }else if (isApprover && req.status === 'Pendiente') {
      actionButton = `<button data-request-id="${req.id}" class="authorize-btn bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold py-1.5 px-3 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-teal-500 active:scale-[0.98]">Revisar</button>`;
    } else if (isTreasury && req.status === 'Autorizado') {
      if (solicitantePuedePagar && req.user_id != currentUser.id) {
        actionButton = `<span class="text-xs font-semibold text-gray-500 dark:text-gray-400 px-3">Paga Solicitante</span>`;
      } else {
        actionButton = `<button data-request-id="${req.id}" class="treasury-review-btn bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold py-1.5 px-3 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500 active:scale-[0.98]">Revisar</button>`;
      }
    } else if (currentUser.id == req.user_id && solicitantePuedePagar) {
      actionButton = `<button data-request-id="${req.id}" class="pay-btn bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-1.5 px-3 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-green-600 active:scale-[0.98]">Pagar</button>`;
    } else if (req.status === 'Pagado' && req.payment_proof_path) {
      actionButton = `<a href="${req.payment_proof_path}" target="_blank" class="text-blue-600 dark:text-blue-300 hover:underline text-xs font-medium">Ver Pago</a>`;
    } else if (req.status === 'Rechazado') {
      actionButton = `<button class="text-red-600 hover:underline text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-600" onclick="alert('Motivo de rechazo:\\n\\n${(req.approver_comments || 'No especificado').replace(/'/g, "\\'")}')">Ver Motivo</button>`;
    } else if (currentUser.id == req.user_id && (req.status === 'Pendiente' || req.status === 'Correccion')) {
      actionButton = `<button data-request-id="${req.id}" class="edit-btn bg-gray-600 hover:bg-gray-700 text-white text-xs font-semibold py-1.5 px-3 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-600 active:scale-[0.98]">Ver / Editar</button>`;
    } else if (req.quote_file_path) {
      actionButton = `<a href="${req.quote_file_path}" target="_blank" class="text-gray-500 dark:text-gray-300 hover:underline text-xs font-medium">Ver Cotización</a>`;
    }

    let processedByInfo = '';
    if (req.approver_name && ['Autorizado', 'Rechazado', 'Correccion', 'Pagado'].includes(req.status)) {
      if (req.status === 'Correccion') {
        processedByInfo += `<div>Corrección por: ${req.payer_name || req.approver_name}</div>`;
      } else if (req.status === 'Rechazado') {
        processedByInfo += `<div>Rechazado por: ${req.payer_name || req.approver_name}</div>`;
      } else {
        processedByInfo += `<div>Autorizado por: ${req.approver_name}</div>`;
      }
    }
    if (req.payer_name && req.status === 'Pagado') {
      processedByInfo += `<div>Pagado por: ${req.payer_name}</div>`;
    }

    const shortCreatorName = req.creator_name.length > 20 ? req.creator_name.substring(0, 20) + '...' : req.creator_name;
    const shortConceptoPago = req.concepto_pago && req.concepto_pago.length > 30 ? req.concepto_pago.substring(0, 30) + '...' : req.concepto_pago;
    const shortProviderName = req.provider_name && req.provider_name.length > 20 ? req.provider_name.substring(0, 20) + '...' : req.provider_name;
    const deadlineDate = new Date(req.deadline);
    const userTimezoneOffset = deadlineDate.getTimezoneOffset() * 60000;
    const localDate = new Date(deadlineDate.getTime() + userTimezoneOffset);
    const formattedDeadline = localDate.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });

    return {
      raw: req,
      statusBadge,
      actionButton,
      processedByInfo,
      shortCreatorName,
      shortConceptoPago,
      shortProviderName,
      formattedDeadline,
      amountFormatted: `$${parseFloat(req.amount).toFixed(2)}`
    };
  });

  // 2) TARJETAS (móvil: visible por defecto, ocultas en md+)
  const cardsHTML = rowsData.map(d => {
    const r = d.raw;
    return `
      <article class="md:hidden bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200/70 dark:border-gray-700 p-4 space-y-2">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="font-semibold text-gray-900 dark:text-white truncate">
              #${r.id} — ${r.concepto_name}
            </h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Solicitante: <span title="${r.creator_name}">${d.shortCreatorName}</span></p>
            <p class="text-xs text-gray-500 dark:text-gray-400">Unidad: ${r.business_unit_name}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400">Proveedor: <span title="${r.provider_name || ''}">${d.shortProviderName || 'N/A'}</span></p>
          </div>
          <span class="px-2 py-1 text-[11px] font-semibold rounded-full ${d.statusBadge} whitespace-nowrap">${r.status}</span>
        </div>

        ${r.concepto_pago ? `<p class="text-sm text-gray-700 dark:text-gray-200"><span class="font-medium">Concepto de pago:</span> <span title="${r.concepto_pago}">${d.shortConceptoPago}</span></p>` : ''}

        <div class="grid grid-cols-2 gap-3 text-sm">
          <div class="bg-gray-50 dark:bg-gray-700/60 rounded-lg p-3">
            <div class="text-xs text-gray-500 dark:text-gray-300">Monto</div>
            <div class="font-semibold text-gray-900 dark:text-white">${d.amountFormatted}</div>
          </div>
          <div class="bg-gray-50 dark:bg-gray-700/60 rounded-lg p-3">
            <div class="text-xs text-gray-500 dark:text-gray-300">Fecha límite</div>
            <div class="font-semibold text-gray-900 dark:text-white">${d.formattedDeadline}</div>
          </div>
        </div>

        ${d.processedByInfo ? `<div class="text-[11px] text-gray-500 dark:text-gray-400">${d.processedByInfo}</div>` : ''}

        <div class="pt-2 flex justify-end">
          ${d.actionButton}
        </div>
      </article>
    `;
  }).join('');

  // 3) FILAS DE TABLA (escritorio/tablet: ocultas en móvil)
  const tableRows = rowsData.map(d => {
    const r = d.raw;
    return `
      <tr class="hidden md:table-row border-b border-gray-200 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/50">
        <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-200 whitespace-nowrap">${r.id}</td>
        <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-200" title="${r.creator_name}">${d.shortCreatorName}</td>
        <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">${r.business_unit_name}</td>
        <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400" title="${r.provider_name || ''}">${d.shortProviderName || 'N/A'}</td>
        <td class="px-4 py-3 text-sm text-gray-800 dark:text-gray-100" title="${r.concepto_pago}">${d.shortConceptoPago || ''}</td>
        <td class="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">${d.amountFormatted}</td>
        <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">${d.formattedDeadline}</td>
        <td class="px-4 py-3 text-sm"><span class="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${d.statusBadge}">${r.status}</span></td>
        <td class="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">${d.processedByInfo}</td>
        <td class="px-4 py-3 text-sm text-center whitespace-nowrap">${d.actionButton}</td>
      </tr>
    `;
  }).join('');

  // 4) CONTENEDOR combinado: tarjetas + tabla (responsive)
  const html = `
    <div class="space-y-3">
      ${cardsHTML}
      <div class="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
        <table class="min-w-full hidden md:table">
          <thead class="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">ID</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Solicitante</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Unidad</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Proveedor</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Concepto de Pago</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Monto</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Fecha Límite</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Estado</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Procesado Por</th>
              <th class="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Acción</th>
            </tr>
          </thead>
          <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            ${tableRows}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // 5) Listeners (funcionan para botones en tarjetas y en tabla)
  setTimeout(() => {
    document.querySelectorAll('.authorize-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const requestId = e.target.getAttribute('data-request-id');
        const requestData = requests.find(r => r.id == requestId);
        showAuthorizeRequestModal(requestData);
      });
    });
    document.querySelectorAll('.pay-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const requestId = e.target.getAttribute('data-request-id');
        const requestData = requests.find(r => r.id == requestId);
        showPaymentModal(requestData);
      });
    });
    document.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const requestId = e.target.getAttribute('data-request-id');
        const requestData = requests.find(r => r.id == requestId);
        showEditRequestModal(requestData);
      });
    });
    document.querySelectorAll('.treasury-review-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const requestId = e.target.getAttribute('data-request-id');
        const requestData = requests.find(r => r.id == requestId);
        showTreasuryActionModal(requestData);
      });
    });
  }, 0);

  return html;
}


async function showEditRequestModal(request) {
    const isEditable = request.status === 'Pendiente' || request.status === 'Correccion';
    const formData = await fetchData('/api/data/get_form_data_v3.php');
    if (!formData) {
        alert('No se pudieron cargar los datos para el formulario. Intente de nuevo.');
        return;
    }
    const unitOptions = formData.business_units.map(u => `<option value="${u.id}" ${u.id == request.business_unit_id ? 'selected' : ''}>${u.name}</option>`).join('');
    const availableReasons = formData.razones_sociales.filter(r => r.business_unit_id == request.business_unit_id);
    const reasonOptions = availableReasons.map(r => `<option value="${r.id}" ${r.id == request.razon_social_id ? 'selected' : ''}>${r.name}</option>`).join('');
    const availableProviders = formData.providers.filter(p => p.business_unit_id == request.business_unit_id);
    const providerOptions = availableProviders.map(p => `<option value="${p.id}" ${p.id == request.proveedor_id ? 'selected' : ''}>${p.name}</option>`).join('');
    const tipoGastoOptions = formData.tipos_gasto.map(tg => `<option value="${tg.id}" ${tg.id == request.tipo_gasto_id ? 'selected' : ''}>${tg.name}</option>`).join('');
    const availableConceptos = formData.conceptos.filter(c => c.tipo_gasto_id == request.tipo_gasto_id);
    const conceptoOptions = availableConceptos.map(c => `<option value="${c.id}" ${c.id == request.concepto_id ? 'selected' : ''}>${c.name}</option>`).join('');
    const deadlineValue = (request.deadline || '').slice(0, 10);
    const modalContent = `
        <div class="bg-white dark:bg-gray-800 p-8 rounded-lg">
            <h3 class="text-xl font-semibold leading-6 text-gray-900 dark:text-gray-100 mb-6 border-b border-gray-200 dark:border-gray-700 pb-3">Detalle de Solicitud #${request.id}</h3>
            ${request.status === 'Correccion' ? `<div class="p-3 mb-4 text-sm text-orange-800 bg-orange-100 dark:bg-orange-900/50 dark:text-orange-300 rounded-lg"><strong>Corrección Requerida:</strong><p class="mt-1">${request.approver_comments || 'Sin comentarios.'}</p></div>` : ''}
            ${!isEditable && request.status !== 'Correccion' ? '<div class="p-3 mb-4 text-sm text-yellow-800 bg-yellow-100 dark:bg-yellow-900/50 dark:text-yellow-300 rounded-lg">Esta solicitud ya ha sido procesada y no se puede editar.</div>' : ''}
            
            <form id="editRequestForm" class="space-y-5">
                <input type="hidden" name="request_id" value="${request.id}">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unidad de Negocio</label><select id="edit_business_unit_id" name="business_unit_id" class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm" ${!isEditable ? 'disabled' : ''} required>${unitOptions}</select></div>
                    <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Razón Social</label><select id="edit_razon_social_id" name="razon_social_id" class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm" ${!isEditable ? 'disabled' : ''} required>${reasonOptions}</select></div>
                    <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Proveedor</label><select id="edit_proveedor_id" name="proveedor_id" class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm" ${!isEditable ? 'disabled' : ''} required>${providerOptions}</select></div>
                    <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Banco</label><select name="banco" class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md" ${!isEditable ? 'disabled' : ''} required><option value="Fiscal" ${request.banco === 'Fiscal' ? 'selected' : ''}>Fiscal</option><option value="Principal" ${request.banco === 'Principal' ? 'selected' : ''}>Principal</option><option value="Exclusivo tesorería" ${request.banco === 'Exclusivo tesorería' ? 'selected' : ''}>Exclusivo tesorería</option></select></div>
                    <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cuenta</label><input type="text" id="edit_proveedor_cuenta" class="block w-full px-3 py-2 border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-700 sm:text-sm" readonly value="${request.provider_account || ''}"></div>
                    <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Referencia</label><input type="text" id="edit_proveedor_referencia" class="block w-full px-3 py-2 border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-700 sm:text-sm" readonly value="${request.provider_reference || ''}"></div>
                    <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de Gasto</label><select id="edit_tipo_gasto_id" name="tipo_gasto_id" class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md" ${!isEditable ? 'disabled' : ''} required>${tipoGastoOptions}</select></div>
                    <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gasto</label><select id="edit_concepto_id" name="concepto_id" class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md" ${!isEditable ? 'disabled' : ''} required>${conceptoOptions}</select></div>
                </div>
                <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Concepto de Pago</label><textarea name="concepto_pago" rows="2" class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm" ${!isEditable ? 'disabled' : ''} required>${request.concepto_pago || ''}</textarea></div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-5 items-end">
                    <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Monto Solicitado ($)</label><input type="number" step="0.01" name="amount" value="${request.amount}" class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm" ${!isEditable ? 'disabled' : ''} required></div>
                    <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha Límite</label><input type="date" id="edit_deadline" name="deadline" value="${deadlineValue}" class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm" ${!isEditable ? 'disabled' : ''} required></div>
                </div>
                <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cotización / Ticket Adjunto</label><a href="${request.quote_file_path}" target="_blank" class="text-blue-600 dark:text-blue-400 hover:underline text-xs">Ver archivo actual</a>${isEditable ? '<input type="file" name="quote_file" class="block w-full text-sm mt-1 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 dark:file:bg-gray-600 dark:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-gray-500 cursor-pointer">' : ''}</div>
                <p id="modal-error" class="text-red-500 text-sm text-center pt-2"></p>
                <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button type="button" id="cancelModalBtn" class="px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-200">Cerrar</button>
                    ${isEditable ? '<button type="submit" class="px-5 py-2 bg-blue-600 text-white rounded-md">Guardar Cambios</button>' : ''}
                </div>
            </form>
        </div>`;
    openModal(modalContent);

    if (isEditable) {
        const unitSelect = document.getElementById('edit_business_unit_id');
        const providerSelect = document.getElementById('edit_proveedor_id');
        const razonSocialSelect = document.getElementById('edit_razon_social_id');
        const cuentaInput = document.getElementById('edit_proveedor_cuenta');
        const referenciaInput = document.getElementById('edit_proveedor_referencia');
        const tipoGastoSelect = document.getElementById('edit_tipo_gasto_id');
        const conceptoSelect = document.getElementById('edit_concepto_id');

        const updateProviderFields = () => {
            const selectedProviderId = providerSelect.value;
            const providerData = formData.providers.find(p => p.id == selectedProviderId);
            if (providerData) {
                cuentaInput.value = providerData.account || '';
                referenciaInput.value = providerData.reference || '';
            } else {
                cuentaInput.value = '';
                referenciaInput.value = '';
            }
        };
        providerSelect.addEventListener('change', updateProviderFields);

        unitSelect.addEventListener('change', () => {
            const selectedUnitId = unitSelect.value;
            [providerSelect, razonSocialSelect].forEach(select => {
                select.innerHTML = '<option value="">-- Cargando... --</option>';
            });
            cuentaInput.value = '';
            referenciaInput.value = '';
            if (!selectedUnitId) {
                providerSelect.innerHTML = '<option value="">-- Seleccione unidad --</option>';
                providerSelect.disabled = true;
                razonSocialSelect.innerHTML = '<option value="">-- Seleccione unidad --</option>';
                razonSocialSelect.disabled = true;
                return;
            }
            const availableProviders = formData.providers.filter(p => p.business_unit_id == selectedUnitId);
            if (availableProviders.length > 0) {
                providerSelect.innerHTML = '<option value="">-- Seleccione proveedor --</option>' + availableProviders.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                providerSelect.disabled = false;
            } else {
                providerSelect.innerHTML = '<option value="">-- No hay proveedores --</option>';
                providerSelect.disabled = true;
            }
            const availableReasons = formData.razones_sociales.filter(r => r.business_unit_id == selectedUnitId);
            if (availableReasons.length > 0) {
                razonSocialSelect.innerHTML = '<option value="">-- Seleccione razón social --</option>' + availableReasons.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
                razonSocialSelect.disabled = false;
            } else {
                razonSocialSelect.innerHTML = '<option value="">-- No hay razones sociales --</option>';
                razonSocialSelect.disabled = true;
            }
        });

        tipoGastoSelect.addEventListener('change', () => {
            const selectedTipoId = tipoGastoSelect.value;
            conceptoSelect.innerHTML = '<option value="">-- Cargando... --</option>';
            if (!selectedTipoId) {
                conceptoSelect.innerHTML = '<option value="">-- Primero seleccione un tipo de gasto --</option>';
                conceptoSelect.disabled = true;
                return;
            }
            const availableConceptos = formData.conceptos.filter(c => c.tipo_gasto_id == selectedTipoId);
            if (availableConceptos.length > 0) {
                conceptoSelect.innerHTML = '<option value="">-- Seleccione un concepto --</option>' + availableConceptos.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
                conceptoSelect.disabled = false;
            } else {
                conceptoSelect.innerHTML = '<option value="">-- No hay conceptos para este tipo --</option>';
                conceptoSelect.disabled = true;
            }
        });
        
        document.getElementById('editRequestForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const submitButton = form.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            submitButton.textContent = 'Guardando...';
            const formData = new FormData(form);
            const dateInput = document.getElementById('edit_deadline');
            if (dateInput.value) {
                formData.set('deadline', dateInput.value);
            }
            const response = await fetch('/api/requests/edit.php', { method: 'POST', body: formData });
            const result = await response.json();
            if (response.ok) {
                closeModal();
                loadDashboard();
            } else {
                document.getElementById('modal-error').textContent = result.error;
                submitButton.disabled = false;
                submitButton.textContent = 'Guardar Cambios';
            }
        });
    }

    document.getElementById('cancelModalBtn').addEventListener('click', closeModal);
}

function renderUsersTable(users) {
    // Mensaje cuando no hay usuarios
    if (!users || users.length === 0) {
        return `<p class="text-gray-500 dark:text-gray-400 p-4 text-center">No se encontraron usuarios con los criterios de búsqueda.</p>`;
    }

    // Generar las filas de la tabla con clases para modo oscuro
    const rows = users.map(user => `
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
            <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">${user.name}</td>
            <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">${user.email}</td>
            <td class="px-4 py-3 text-sm text-blue-700 dark:text-blue-400 font-medium whitespace-nowrap">${user.role}</td>
            <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">${user.business_unit_name || 'N/A'}</td>
            <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">${new Date(user.created_at).toLocaleDateString('es-MX')}</td>
        </tr>
    `).join('');

    // Retornar solo la tabla. El contenedor con fondo y sombra ya está en loadAdminDashboard.
    return `
        <div class="overflow-x-auto">
            <table class="min-w-full">
                <thead class="bg-gray-50 dark:bg-gray-700">
                    <tr>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Nombre</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Email</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Rol</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Unidad</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Creado</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', () => {
    const html = document.documentElement;
    const darkModeToggle = document.getElementById('darkModeToggle');
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme === 'dark') {
        html.classList.add('dark');
    }

    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', () => {
            html.classList.toggle('dark');
            if (html.classList.contains('dark')) {
                localStorage.setItem('theme', 'dark');
            } else {
                localStorage.setItem('theme', 'light');
            }
        });
    }
});

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 12000 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function fetchData(url) {
  try {
    const res = await fetchWithTimeout(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`, { timeout: 12000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`Error al obtener ${url}:`, err);
    return null;
  }
}

function openModal(content) {
    document.getElementById('modal-content').innerHTML = content;
    document.getElementById('modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden'; 
}

function closeModal() {
    document.getElementById('modal').classList.add('hidden');
    document.getElementById('modal-content').innerHTML = '';
    document.body.style.overflow = ''; 
}
