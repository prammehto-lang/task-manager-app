// app.js
// TaskFlow Pro - Auto Reminder System

const DB_NAME = 'TaskFlowDB_V2'; // Upgraded DB version due to schema change
const DB_VERSION = 1;
const STORE_NAME = 'tasks';

let db;

// DOM Elements
const taskForm = document.getElementById('taskForm');
const taskGrid = document.getElementById('taskGrid');
const searchFilter = document.getElementById('searchFilter');
const statusFilter = document.getElementById('statusFilter');
const exportBtn = document.getElementById('exportBtn');
const notificationBtn = document.getElementById('notificationBtn');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initDB();
    setupEventListeners();
    setupAutoReminders();
    
    // Check Notification Status
    if (Notification.permission === "granted") {
        notificationBtn.classList.add('btn-primary');
        notificationBtn.classList.remove('btn-outline');
        notificationBtn.innerHTML = '<i class="fa-solid fa-bell"></i> Alerts Active';
    }
});

// Setup IndexedDB
function initDB() {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => { console.error('Database error:', event.target.errorCode); };

    request.onsuccess = (event) => {
        db = event.target.result;
        loadTasks();
    };

    request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        objectStore.createIndex('title', 'title', { unique: false });
        objectStore.createIndex('status', 'status', { unique: false });
        console.log('Database setup complete');
    };
}

// Event Listeners
function setupEventListeners() {
    taskForm.addEventListener('submit', handleAddTask);
    searchFilter.addEventListener('input', loadTasks);
    statusFilter.addEventListener('change', loadTasks);
    exportBtn.addEventListener('click', exportToCSV);
    notificationBtn.addEventListener('click', requestNotifications);
}

function requestNotifications() {
    if (!("Notification" in window)) {
        alert("This browser does not support desktop notification");
    } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                notificationBtn.classList.add('btn-primary');
                notificationBtn.classList.remove('btn-outline');
                notificationBtn.innerHTML = '<i class="fa-solid fa-bell"></i> Alerts Active';
                sendAlert("Notifications Enabled", "You will now receive auto-reminders.");
            }
        });
    }
}

// System Alert Generator (Push + Email Sim)
function sendAlert(title, body, notifyManager = false) {
    // 1. Browser Notification
    if (Notification.permission === 'granted') {
        new Notification(title, { body: body, icon: 'icon-192x192.png' });
    }
    
    // 2. Simulated Email System via Toast
    createToast(`Email Sent: ${title}`);
    
    if (notifyManager) {
        createToast(`Manager Notified: ${body}`);
    }

    // Console log the "Webhook" request simulation
    console.log(`[NETWORK HOOK] Sent alert - '${title}' : '${body}'`);
}

// Toast Helper
function createToast(message) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fa-solid fa-envelope"></i> ${message}`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// Add New Task
function handleAddTask(e) {
    e.preventDefault();

    const title = document.getElementById('taskName').value.trim();
    const assignedTo = document.getElementById('taskAssignedTo').value.trim();
    const employeeMobile = document.getElementById('taskEmployeeMobile').value.trim();
    const employeeEmail = document.getElementById('taskEmployeeEmail').value.trim();
    const assignedBy = document.getElementById('taskAssignedBy').value.trim();
    const startDate = document.getElementById('taskStartDate').value;
    const dueDate = document.getElementById('taskDueDate').value;
    const priority = document.getElementById('taskPriority').value;
    const status = document.getElementById('taskStatus').value;
    const reminderFreq = parseInt(document.getElementById('taskReminder').value);
    const remarks = document.getElementById('taskRemarks').value.trim();

    if (!title || !assignedTo || !dueDate) return;

    // Auto ID generation (e.g. TSK-4829)
    const taskNumber = Math.floor(Math.random() * 9000) + 1000;
    const taskId = `TSK-${taskNumber}`;

    const newTask = {
        id: taskId,
        title,
        assignedTo,
        employeeMobile,
        employeeEmail,
        assignedBy,
        startDate,
        dueDate,
        priority,
        status,
        reminderFreq,
        remarks,
        createdAt: new Date().toISOString(),
        lastReminderSent: new Date().getTime(),
        completionTime: null
    };

    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.add(newTask);

    request.onsuccess = () => {
        taskForm.reset();
        document.getElementById('taskPriority').value = "Medium";
        document.getElementById('taskStatus').value = "Pending";
        loadTasks();
        
        // Trigger Assignment flow
        sendAlert(
            `New task assigned to you: ${taskId}`,
            `Task "${title}" requires your attention.`
        );

        // Instantly generate and open the WhatsApp Share link
        if (confirm(`Task Created! Do you want to send this assignment to ${assignedTo} via WhatsApp now?`)) {
            shareToWhatsApp(newTask);
        }
    };
}

// Share via WhatsApp logic
window.shareToWhatsApp = function(task) {
    if (!task.employeeMobile) {
        alert("No mobile number provided for this employee.");
        return;
    }
    
    // Format Date beautifully
    const fDue = task.dueDate ? new Date(task.dueDate).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : 'N/A';
    
    const message = `*🔔 NEW TASK ASSIGNMENT: ${task.id}*\n\n` +
                    `*Task:* ${task.title}\n` +
                    `*Assigned By:* ${task.assignedBy}\n` +
                    `*Due Date:* ${fDue}\n` +
                    `*Priority:* ${task.priority}\n\n` +
                    `*Remarks:* ${task.remarks || 'None'}\n\n` +
                    `_Please reply to this message when completed._`;

    const encodedMessage = encodeURIComponent(message);
    // Strip everything except numbers from mobile
    const cleanMobile = task.employeeMobile.replace(/\D/g, ''); 
    const url = `https://wa.me/${cleanMobile}?text=${encodedMessage}`;
    
    window.open(url, '_blank');
};

// Share via Email logic
window.shareToEmail = function(task) {
    if (!task.employeeEmail) {
        alert("No email provided for this employee.");
        return;
    }
    
    const fDue = task.dueDate ? new Date(task.dueDate).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : 'N/A';
    
    const subject = `NEW TASK ASSIGNMENT: ${task.id} - ${task.title}`;
    const body = `Hello ${task.assignedTo},\n\nYou have been assigned a new task.\n\nTask: ${task.title}\nAssigned By: ${task.assignedBy}\nDue Date: ${fDue}\nPriority: ${task.priority}\n\nRemarks: ${task.remarks || 'None'}\n\nPlease reply to this email when you have completed this block of work.`;

    const url = `mailto:${encodeURIComponent(task.employeeEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(url, '_self');
};

// Load and Render Tasks
function loadTasks() {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.getAll();

    request.onsuccess = () => {
        let tasks = request.result;
        
        const searchTerm = searchFilter.value.toLowerCase();
        const statusTerm = statusFilter.value;

        if (searchTerm) {
            tasks = tasks.filter(t => t.title.toLowerCase().includes(searchTerm) || t.id.toLowerCase().includes(searchTerm));
        }

        if (statusTerm !== 'All') {
            tasks = tasks.filter(t => t.status === statusTerm);
        }

        tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        renderTasks(tasks);
    };
}

// Render Tasks
function renderTasks(tasks) {
    taskGrid.innerHTML = '';
    
    if(tasks.length === 0) {
        taskGrid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-clipboard-list"></i><p>No active tasks.</p></div>';
        return;
    }

    const now = new Date().getTime();

    tasks.forEach(task => {
        const card = document.createElement('div');
        card.className = `task-card priority-${task.priority}`;
        const statusClass = `status-${task.status.replace(' ', '.')}`;
        
        const dueTime = new Date(task.dueDate).getTime();
        const isOverdue = (now > dueTime) && (task.status !== 'Completed');
        
        // Format dates safely
        const fStart = task.startDate ? new Date(task.startDate).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : 'None';
        const fDue = task.dueDate ? new Date(task.dueDate).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : 'None';

        card.innerHTML = `
            <div class="task-card-header">
                <div>
                    <span class="task-id">${task.id}</span>
                    <div class="task-card-title">${escapeHTML(task.title)}</div>
                </div>
                <button class="btn-icon" onclick="deleteTask('${task.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
            
            <div class="card-meta">
                <div><span class="meta-label">Assigned To</span><span class="meta-value">${escapeHTML(task.assignedTo)}</span></div>
                <div><span class="meta-label">Assigned By</span><span class="meta-value">${escapeHTML(task.assignedBy)}</span></div>
                <div><span class="meta-label">Start Date</span><span class="meta-value">${fStart}</span></div>
                <div><span class="meta-label">Due Date</span><span class="meta-value ${isOverdue ? 'overdue' : ''}">${fDue} ${isOverdue ? '<i class="fa-solid fa-triangle-exclamation"></i>' : ''}</span></div>
            </div>

            <div class="task-card-desc">${escapeHTML(task.remarks) || '<i>No remarks</i>'}</div>
            
            <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
                <button class="btn btn-outline" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick='shareToWhatsApp(${JSON.stringify(task).replace(/'/g, "&apos;")})'>
                    <i class="fa-brands fa-whatsapp" style="color: #25D366;"></i> WhatsApp
                </button>
                <button class="btn btn-outline" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick='shareToEmail(${JSON.stringify(task).replace(/'/g, "&apos;")})'>
                    <i class="fa-regular fa-envelope" style="color: var(--primary);"></i> Email
                </button>
            </div>

            ${task.completionTime ? `<div class="completion-time-bar">Completed to log: ${new Date(task.completionTime).toLocaleString()}</div>` : ''}

            <div class="task-actions">
                <select class="status-select ${statusClass}" onchange="updateTaskStatus('${task.id}', this.value)">
                    <option value="Pending" ${task.status === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option value="In Progress" ${task.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                    <option value="Completed" ${task.status === 'Completed' ? 'selected' : ''}>Completed</option>
                </select>
                <div style="font-size:0.75rem; color:var(--primary);"><i class="fa-solid fa-clock"></i> Auto-Reminders</div>
            </div>
        `;
        taskGrid.appendChild(card);
    });
}

// Update Task Status
window.updateTaskStatus = function(id, newStatus) {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.get(id);

    request.onsuccess = () => {
        const task = request.result;
        const oldStatus = task.status;
        task.status = newStatus;
        
        // Handle Completion
        if(newStatus === 'Completed' && oldStatus !== 'Completed') {
            task.completionTime = new Date().toISOString();
            
            // Notify Manager
            sendAlert(
                `Task ${task.id} Completed!`,
                `Task ${task.title} completed by ${task.assignedTo}`,
                true // flag to notify manager
            );
        } else if (newStatus !== 'Completed') {
            task.completionTime = null; // Revert completion time if moved back
        }
        
        objectStore.put(task).onsuccess = () => loadTasks();
    };
};

window.deleteTask = function(id) {
    if(!confirm("Delete this task?")) return;
    db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME).delete(id).onsuccess = () => loadTasks();
};

// AUTO REMINDER SYSTEM (THE CORE ENGINE)
function setupAutoReminders() {
    // Run every 10 seconds to check due dates and reminder frequencies
    setInterval(() => {
        if (!db) return;
        
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.getAll();

        request.onsuccess = () => {
            const tasks = request.result;
            const now = new Date().getTime();
            let needsRerender = false;

            tasks.forEach(task => {
                // Only remind for Pending or In Progress
                if (task.status === 'Completed') return;

                const dueTime = new Date(task.dueDate).getTime();
                
                // 1. Check if Overdue 
                if (now > dueTime && !task.overdueAlertSent) {
                    sendAlert(`Task Overdue 🚨`, `Task ${task.id} (${task.title}) is past its due date!`);
                    task.overdueAlertSent = true;
                    objectStore.put(task);
                    needsRerender = true;
                }

                // 2. Check Recurring Reminders
                // "If Status = Pending -> wait X -> send reminder -> repeat until completed"
                if (now - task.lastReminderSent >= task.reminderFreq) {
                    sendAlert(
                        `Reminder: Complete task`,
                        `Task ${task.id} (${task.title}) assigned to you needs action.`
                    );
                    
                    // Update last reminder to jump forward
                    task.lastReminderSent = now;
                    objectStore.put(task);
                }
            });

            if(needsRerender) loadTasks();
        };
    }, 10000); // Polls every 10s strictly for demo precision, scales well via WebSockets natively
}

// Export to CSV Functionality
function exportToCSV() {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.getAll();

    request.onsuccess = () => {
        const tasks = request.result;
        if (tasks.length === 0) return alert('No tasks to export!');

        let csvContent = "ID,Title,AssignedTo,AssignedBy,Priority,Status,StartDate,DueDate,CompletionTime,Remarks\n";

        tasks.forEach(t => {
            const row = [
                t.id,
                `"${escapeForCSV(t.title)}"`,
                `"${escapeForCSV(t.assignedTo)}"`,
                `"${escapeForCSV(t.assignedBy)}"`,
                t.priority,
                t.status,
                t.startDate,
                t.dueDate,
                t.completionTime || 'Not Completed',
                `"${escapeForCSV(t.remarks)}"`
            ].join(',');
            csvContent += row + "\n";
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `TaskFlow_Export.csv`);
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
}

function escapeHTML(str) { return str ? str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag])) : ''; }
function escapeForCSV(str) { return str ? str.replace(/"/g, '""').replace(/\n/g, ' ') : ''; }

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').then(reg => {
            console.log('SW registered');
        });
    });
}
