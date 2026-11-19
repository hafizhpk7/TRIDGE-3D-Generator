import { lazy, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, IconButton, Modal, Panel, Tabs, Toggle, useToast } from '../design/components';
import { InputStep } from './InputStep';
import { Lazy } from './ErrorBoundary';
import { Onboarding } from './Onboarding';
import { tourSeen } from './tour';
import { useShell } from './shellStore';
import { useSound } from './sound';
import { StepTracker } from './StepTracker';
import { STEPS } from './steps';
import { ThemeToggle } from './ThemeToggle';
import './Workspace.css';

// Everything heavy loads only when it is first needed, so the first screen appears quickly.
const ViewerPanel = lazy(() => import('../viewer/ViewerPanel'));
const GeneratePanel = lazy(() =>
  import('../pipeline/providers/GeneratePanel').then((m) => ({ default: m.GeneratePanel })),
);
const LowPolyPanel = lazy(() =>
  import('../pipeline/lowpoly/LowPolyPanel').then((m) => ({ default: m.LowPolyPanel })),
);
const CraftDetailPanel = lazy(() =>
  import('../craft/ui/CraftDetailPanel').then((m) => ({ default: m.CraftDetailPanel })),
);
const RigPanel = lazy(() => import('../rig/RigPanel').then((m) => ({ default: m.RigPanel })));
const AnimatePanel = lazy(() =>
  import('../animate/AnimatePanel').then((m) => ({ default: m.AnimatePanel })),
);
const ExportPanel = lazy(() =>
  import('../export/ExportPanel').then((m) => ({ default: m.ExportPanel })),
);
const ProjectsModal = lazy(() =>
  import('../projects/ProjectsModal').then((m) => ({ default: m.ProjectsModal })),
);
const SaveStatus = lazy(() =>
  import('../projects/ProjectsModal').then((m) => ({ default: m.SaveStatus })),
);

const About = lazy(() => import('./About').then((m) => ({ default: m.About })));

const TOOL_TABS = [
  { label: 'Low poly', step: 'lowpoly' },
  { label: 'Rig', step: 'rig' },
  { label: 'Animate', step: 'animate' },
  { label: 'Export', step: 'export' },
];

export function Workspace() {
  const step = useShell((s) => s.step);
  const setStep = useShell((s) => s.setStep);
  const openGallery = useShell((s) => s.openGallery);
  const galleryOpen = useShell((s) => s.galleryOpen);
  const craft = useShell((s) => s.craft);
  const soundOn = useSound((s) => s.enabled);
  const setSound = useSound((s) => s.setEnabled);
  const [tool, setTool] = useState('low-poly');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [tour, setTour] = useState(false);
  const toast = useToast();

  // Tell people early when the internet drops, and which parts still work without it.
  useEffect(() => {
    const off = () =>
      toast.show(
        'You are offline. Making models from pictures needs the internet; Craft, rigging, animating and exporting still work.',
        'error',
      );
    const on = () => toast.show('You are back online.');
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    return () => {
      window.removeEventListener('offline', off);
      window.removeEventListener('online', on);
    };
  }, [toast]);

  // Autosave lives with the heavy code, so it is loaded after the first screen is up.
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    void import('../projects/store').then((m) => {
      if (!cancelled) stop = m.startAutosave();
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  // First visit: offer the short tour once the page has settled.
  useEffect(() => {
    if (tourSeen()) return;
    const t = window.setTimeout(() => setTour(true), 900);
    return () => window.clearTimeout(t);
  }, []);

  const current = STEPS.find((s) => s.id === step) ?? STEPS[0];

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to the main area
      </a>
      <header className="topbar">
        <h1 className="sr-only">TRIDGE workspace</h1>
        <Link to="/" className="topbar__logo">
          <img src="./tridge-logo.svg" alt="TRIDGE" height={44} />
        </Link>
        <nav className="topbar__actions" aria-label="App">
          <Lazy label="Save status" fallback={null}>
            <SaveStatus />
          </Lazy>
          <Button variant="ghost" onClick={openGallery}>
            Projects
          </Button>
          <Link to="/playground" className="btn btn--ghost topbar__link">
            Playground
          </Link>
          <ThemeToggle />
          <IconButton label="Help and settings" onClick={() => setHelpOpen(true)}>
            ?
          </IconButton>
        </nav>
      </header>

      <main className="workspace" id="main" tabIndex={-1}>
        <div className="workspace__steps">
          <StepTracker current={step} onSelect={setStep} />
          <Lazy label="This step">
            {step === 'input' ? (
              <InputStep />
            ) : step === 'generate' && craft ? (
              <Panel title="Generate" accent="orange">
                <p>
                  Your Craft model is already built and rigged, so there is nothing to generate.
                </p>
                <Button variant="secondary" onClick={() => setStep('lowpoly')}>
                  Go to Low poly
                </Button>
              </Panel>
            ) : step === 'generate' ? (
              <GeneratePanel
                onGoToInput={() => setStep('input')}
                onGoToLowPoly={() => setStep('lowpoly')}
              />
            ) : step === 'rig' ? (
              <Panel title="Rig" accent="violet">
                <RigPanel craft={craft} />
              </Panel>
            ) : step === 'animate' ? (
              <AnimatePanel />
            ) : step === 'export' ? (
              <ExportPanel />
            ) : step === 'lowpoly' ? (
              craft ? (
                <CraftDetailPanel />
              ) : (
                <LowPolyPanel />
              )
            ) : (
              <Panel title={current.title} accent={current.color} className="step-detail">
                <p>{current.hint}</p>
              </Panel>
            )}
          </Lazy>
        </div>

        <Lazy
          label="The viewer"
          fallback={<div className="viewer" data-tour="viewer" aria-busy="true" />}
        >
          <ViewerPanel />
        </Lazy>

        <aside
          className={`tools ${sheetOpen ? 'tools--open' : ''}`}
          aria-label="Tools"
          data-tour="tools"
        >
          <button
            type="button"
            className="tools__handle"
            aria-expanded={sheetOpen}
            onClick={() => setSheetOpen((o) => !o)}
          >
            <span className="tools__grip" aria-hidden="true" />
            {sheetOpen ? 'Hide tools' : 'Show tools'}
          </button>
          <div className="tools__body">
            <Panel title="Tools">
              <Tabs
                ariaLabel="Tools"
                value={tool}
                onChange={setTool}
                tabs={TOOL_TABS.map(({ label, step: target }) => ({
                  id: label.toLowerCase().replace(' ', '-'),
                  label,
                  content: (
                    <div>
                      <p className="muted">
                        {label} has its own step in the Steps list, with room for all its controls.
                      </p>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setStep(target);
                          setSheetOpen(false);
                        }}
                      >
                        Open {label}
                      </Button>
                    </div>
                  ),
                }))}
              />
            </Panel>
          </div>
        </aside>
      </main>

      {galleryOpen && (
        <Lazy label="Your projects" fallback={null}>
          <ProjectsModal />
        </Lazy>
      )}

      {aboutOpen && (
        <Lazy label="About" fallback={null}>
          <About open onClose={() => setAboutOpen(false)} />
        </Lazy>
      )}

      {tour && <Onboarding onClose={() => setTour(false)} />}

      <Modal
        open={helpOpen}
        title="Help and settings"
        onClose={() => setHelpOpen(false)}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setHelpOpen(false);
                setAboutOpen(true);
              }}
            >
              About and credits
            </Button>
            <Button onClick={() => setHelpOpen(false)}>Got it</Button>
          </>
        }
      >
        <h3>How it works</h3>
        <p>
          Work down the steps. Make a model from a photo, from words, or with Craft, then make it
          low poly, rig it, animate it and export it. Everything runs in your browser, and your work
          saves itself under Projects.
        </p>
        <h3>In the viewer</h3>
        <p>
          Drag to turn the model, scroll or pinch to zoom, and use the small buttons under it to
          change how it looks.
        </p>
        <h3>Settings</h3>
        <Toggle
          label="Play small sounds when something finishes"
          checked={soundOn}
          onChange={setSound}
        />
        <p>
          <Button
            variant="secondary"
            onClick={() => {
              setHelpOpen(false);
              setTour(true);
            }}
          >
            Show the tour again
          </Button>
        </p>
      </Modal>
    </div>
  );
}
