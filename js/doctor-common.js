document.addEventListener("DOMContentLoaded", () => {
    const sidebar = document.querySelector(".sidebar");
    const menuToggle = document.querySelector(".menu-toggle");
    const backdrop = document.querySelector(".sidebar-backdrop");
    const navLinks = document.querySelectorAll(".sidebar a");

    if (!sidebar || !menuToggle || !backdrop) {
        return;
    }

    const closeSidebar = () => {
        sidebar.classList.remove("active");
        backdrop.classList.remove("active");
    };

    const openSidebar = () => {
        sidebar.classList.add("active");
        backdrop.classList.add("active");
    };

    menuToggle.addEventListener("click", () => {
        if (sidebar.classList.contains("active")) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });

    backdrop.addEventListener("click", closeSidebar);

    navLinks.forEach((link) => {
        link.addEventListener("click", () => {
            if (window.innerWidth <= 992) {
                closeSidebar();
            }
        });
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 992) {
            closeSidebar();
        }
    });
});
