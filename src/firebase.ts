// Firebase app initialization.
//
// It's fine for these values to be public in client code; Firestore
// access is controlled by the security rules you set in the Firebase
// Console (see the setup notes provided alongside this file), not by
// keeping this config secret.
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAoJW3WPHQvvZWvn4_gR04zzWKHuh-l7wo',
  authDomain: 'beachfootballleague3.firebaseapp.com',
  projectId: 'beachfootballleague3',
  storageBucket: 'beachfootballleague3.firebasestorage.app',
  messagingSenderId: '988555116202',
  appId: '1:988555116202:web:b3a251d556d498beba1ad3',
  measurementId: 'G-N8DPFYY7B5',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
