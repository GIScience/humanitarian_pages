/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{vue,js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                oqapi: {
                    bg: '#F3F3F3',
                    'card-bg': '#fff',
                    border: '#E1E0E1',
                    text: '#2C3038',
                }
            },
            fontFamily: {
                sans: ['Archivo', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
