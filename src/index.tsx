import {render} from 'preact';
import posthog from 'posthog-js';

import './css/fonts.css';
import './css/global.scss';
import './css/buttons.scss';

import AppInner from './components/App/App';
import {AppContext, AppState} from './app-state';
import {OverlayProvider} from './components/Overlay/Overlay';
import {ToastProvider} from './components/Toast/Toast';
import {ContextMenuProvider} from './components/Widgets/Widgets';
import PwaUpdatePrompt from './components/PwaUpdatePrompt/PwaUpdatePrompt';

posthog.init(import.meta.env.VITE_POSTHOG_PROJECT_TOKEN, {
    api_host: import.meta.env.VITE_POSTHOG_HOST,
    capture_pageview: 'history_change',
    capture_pageleave: true,
    disable_session_recording: true,
    loaded: (ph) => {
        if (import.meta.env.DEV) ph.opt_out_capturing();
    },
});

const store = new AppState();

export function App() {
    return (
        <AppContext.Provider value={store}>
            <OverlayProvider>
                <ContextMenuProvider>
                    <ToastProvider>
                        <PwaUpdatePrompt />
                        <AppInner />
                    </ToastProvider>
                </ContextMenuProvider>
            </OverlayProvider>
        </AppContext.Provider>
    );
}

document.body.className = '';
render(<App />, document.body);
