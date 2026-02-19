function startConsultation(button) {
    let row = button.closest("tr");
    let statusCell = row.children[4];
    statusCell.textContent = "In Progress";
    statusCell.className = "status status-progress";

    row.children[5].innerHTML =
        '<button class="action-btn complete" onclick="completeConsultation(this)">Complete</button>';
}

function completeConsultation(button) {
    let row = button.closest("tr");
    let statusCell = row.children[4];
    statusCell.textContent = "Completed";
    statusCell.className = "status status-completed";
    row.children[5].innerHTML = "—";
}

function cancelAppointment(button) {
    let row = button.closest("tr");
    let statusCell = row.children[4];
    statusCell.textContent = "Cancelled";
    statusCell.className = "status status-cancelled";
    row.children[5].innerHTML = "—";
}
