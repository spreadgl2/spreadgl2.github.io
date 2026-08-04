import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import App from './App';

const root = document.getElementById('root');
if (!root) throw new Error('root element not found');

if (
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get('dev') === 'b117-stress'
) {
  import('./dev/B117StressPage.js').then(({ B117StressPage }) => {
    createRoot(root).render(
      <StrictMode>
        <B117StressPage />
      </StrictMode>,
    );
  });
} else {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
