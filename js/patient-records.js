function searchPatient() {
    let aadhaar = document.getElementById("aadhaar").value;
    if (aadhaar.length >= 4) {
        document.getElementById("patientInfo").style.display = "block";
        document.getElementById("prescriptionTable").style.display = "block";
        document.getElementById("addPrescription").style.display = "block";
    }
}

function addPrescription() {
    let doctor = document.getElementById("doctorName").value;
    let diagnosis = document.getElementById("diagnosis").value;
    let medications = document.getElementById("medications").value;

    let table = document.getElementById("prescriptionBody");

    let newRow = table.insertRow();
    newRow.insertCell(0).innerText = "Today";
    newRow.insertCell(1).innerText = doctor;
    newRow.insertCell(2).innerText = diagnosis;
    newRow.insertCell(3).innerText = medications;

    document.getElementById("doctorName").value = "";
    document.getElementById("diagnosis").value = "";
    document.getElementById("medications").value = "";
}
