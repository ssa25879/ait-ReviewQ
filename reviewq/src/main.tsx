import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ContentProvider } from './app/store.tsx'
import { RouterProvider } from './app/RouterProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ContentProvider>
      <RouterProvider>
        <App />
      </RouterProvider>
    </ContentProvider>
  </StrictMode>,
)
