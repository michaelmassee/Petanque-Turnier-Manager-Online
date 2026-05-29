const path = require('path');
const defaultTheme = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        path.resolve(__dirname, 'vendor/laravel/framework/src/Illuminate/Pagination/resources/views/*.blade.php'),
        path.resolve(__dirname, 'storage/framework/views/*.php'),
        path.resolve(__dirname, 'resources/views/**/*.blade.php'),
        path.resolve(__dirname, 'resources/js/**/*.js'),
    ],

    theme: {
        extend: {
            fontFamily: {
                sans: ['Figtree', ...defaultTheme.fontFamily.sans],
            },
        },
    },

    plugins: [require('@tailwindcss/forms')],
};
