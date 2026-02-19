function completeConsultation() {
    document.getElementById("successMessage").style.display = "block";
    setTimeout(() => {
        document.getElementById("successMessage").style.display = "none";
    }, 3000);
}
