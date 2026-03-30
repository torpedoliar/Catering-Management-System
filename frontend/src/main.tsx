import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initCapacitor } from './capacitor-init'

// Initialize Capacitor native features (back button, status bar, splash screen)
// This is a no-op when running in a regular browser
initCapacitor();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
