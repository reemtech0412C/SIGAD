export default {
  content: ["./frontend/index.html", "./frontend/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        institutionnel: {
          principal: "#0F3D6E",
          accent: "#1E56A0",
          fond: "#F8FAFC",
        },
        etat: {
          succes: "#15803D",
          succesFond: "#DCFCE7",
          attente: "#B45309",
          attenteFond: "#FEF3C7",
          alerte: "#B91C1C",
          alerteFond: "#FEE2E2",
        },
      },
      fontFamily: {
        sans: ["Inter", "Public Sans", "Arial", "sans-serif"],
      },
    },
  },
};
