import { initializeApp } from "firebase/app";
const firebaseConfig = {
    apiKey: "AIzaSyB6Ei_R7tUQIUEfbGgeDHHcXjw0pplgbKU",
    authDomain: "tracker-85225.firebaseapp.com",
    projectId: "tracker-85225",
    storageBucket: "tracker-85225.firebasestorage.app",
    messagingSenderId: "605948357141",
    appId: "1:605948357141:web:2a59c8d3434654efb97c1c"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const PROJECT_NAME = 'JEF';

export const TEAM = [
  { id: 'artem', name: 'Artem', color: '#3B6FE0', email: 'artem.diakunchak@student.howest.be' },
  { id: 'dima', name: 'Dima', color: '#E0663B', email: 'DIMA_EMAIL@student.howest.be' },
  { id: 'lucy', name: 'Lucy', color: '#1F9D61', email: 'LUCY_EMAIL@student.howest.be' },
];

export const EMAIL_DOMAIN = 'teamhours.example';
