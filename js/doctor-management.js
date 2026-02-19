function approveDoctor(button) {
    let row = button.closest("tr");
    let statusCell = row.children[3];
    statusCell.textContent = "Approved";
    statusCell.className = "status-approved";
}

function rejectDoctor(button) {
    let row = button.closest("tr");
    let statusCell = row.children[3];
    statusCell.textContent = "Rejected";
    statusCell.className = "status-rejected";
}
