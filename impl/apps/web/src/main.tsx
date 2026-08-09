import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/app.css';
import { PhienProvider } from './lib/auth.js';
import { BoDinhTuyen } from './lib/router.js';
import { App } from './App.js';

createRoot(document.getElementById('goc')!).render(
  <StrictMode>
    <PhienProvider>
      <BoDinhTuyen>
        <App />
      </BoDinhTuyen>
    </PhienProvider>
  </StrictMode>,
);
