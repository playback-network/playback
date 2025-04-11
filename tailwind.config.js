/** @type {import('tailwindcss').Config} */

module.exports = {
    content: [
      './src/renderer/**/*.{js,ts,jsx,tsx}', // ✅ critical: covers all TSX files
      './src/renderer/index.html', 
    ], // Modify this to match your folder structure
    theme: {
      extend: {
        colors: {
          primary: '#000000', // Example primary color matching your website
          'primary-dark': '#333333', // Darker version for hover effects
          secondary: '#262626', // Secondary color
        },
      },
    },
    plugins: [],
  };
  