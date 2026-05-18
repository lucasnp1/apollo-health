import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@ionic/react/css/core.css'
import '@ionic/react/css/normalize.css'
import '@ionic/react/css/structure.css'
import '@ionic/react/css/typography.css'
import { IonApp, setupIonicReact } from '@ionic/react'
import './index.css'
import App from './App.tsx'

setupIonicReact({ mode: 'ios' })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IonApp>
      <App />
    </IonApp>
  </StrictMode>,
)
