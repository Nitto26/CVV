new Chart(document.getElementById("appointmentsChart"), {
    type: "line",
    data: {
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        datasets: [{
            label: "Appointments",
            data: [40, 52, 38, 60, 75, 68, 55],
            borderColor: "#10b981",
            backgroundColor: "rgba(16,185,129,0.2)",
            fill: true,
            tension: 0.4
        }]
    }
});

new Chart(document.getElementById("diseaseChart"), {
    type: "bar",
    data: {
        labels: ["Dengue", "Fever", "Fracture", "Cardiac", "Respiratory"],
        datasets: [{
            label: "Cases",
            data: [25, 40, 15, 10, 18],
            backgroundColor: [
                "#10b981",
                "#2563eb",
                "#f59e0b",
                "#ef4444",
                "#8b5cf6"
            ]
        }]
    }
});
