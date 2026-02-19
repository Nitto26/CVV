function completeAppointment(button) {
    let row = button.closest("tr");
    let statusCell = row.children[5];
    statusCell.textContent = "Completed";
    statusCell.className = "status status-completed";
    row.children[6].innerHTML = "—";
}

function cancelAppointment(button) {
    let row = button.closest("tr");
    let statusCell = row.children[5];
    statusCell.textContent = "Cancelled";
    statusCell.className = "status status-cancelled";
    row.children[6].innerHTML = "—";
}
