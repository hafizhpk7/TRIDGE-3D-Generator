import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, IconButton, Modal, Panel, Tabs, useToast } from '../design/components';
import { InputStep } from './InputStep';
import { GeneratePanel } from '../pipeline/providers/GeneratePanel';
import { LowPolyPanel } from '../pipeline/lowpoly/LowPolyPanel';
import { StepTracker } from './StepTracker';
import { STEPS } from './steps';
import { ThemeToggle } from './ThemeToggle';
import './Workspace.css';

const ViewerPanel = lazy(() => import('../viewer/ViewerPanel'));

const TOOL_TABS = ['Low poly', 'Rig', 'Animate', 'Export'];

export function Workspace() {
  const [step, setStep] = useState('input');
  const [tool, setTool] = useState('low-poly');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const toast = useToast();

  const current = STEPS.find((s) => s.id === step) ?? STEPS[0];

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="topbar__logo">
          <img src="./tridge-logo.svg" alt="TRIDGE" height={44} />
        </Link>
        <nav className="topbar__actions" aria-label="App">
          <Button variant="ghost" onClick={() => toast.show('Projects arrive in a later phase.')}>
            Projects
          </Button>
          <Link to="/playground" className="btn btn--ghost topbar__link">
            Playground
          </Link>
          <ThemeToggle />
          <IconButton label="Help" onClick={() => setHelpOpen(true)}>
            ?
          </IconButton>
        </nav>
      </header>

      <main className="workspace">
        <div className="workspace__steps">
          <StepTracker current={step} onSelect={setStep} />
          {step === 'input' ? (
            <InputStep />
          ) : step === 'generate' ? (
            <GeneratePanel
              onGoToInput={() => setStep('input')}
              onGoToLowPoly={() => setStep('lowpoly')}
            />
          ) : step === 'lowpoly' ? (
            <LowPolyPanel />
          ) : (
            <Panel title={current.title} accent={current.color} className="step-detail">
              <p>{current.hint}</p>
              <p className="muted">This panel gets its controls in a later phase.</p>
            </Panel>
          )}
        </div>

        <Suspense fallback={<div className="viewer" aria-busy="true" />}>
          <ViewerPanel />
        </Suspense>

        <aside className={`tools ${sheetOpen ? 'tools--open' : ''}`} aria-label="Tools">
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
                tabs={TOOL_TABS.map((label) => ({
                  id: label.toLowerCase().replace(' ', '-'),
                  label,
                  content: <p className="muted">{label} tools will appear here.</p>,
                }))}
              />
            </Panel>
          </div>
        </aside>
      </main>

      <Modal
        open={helpOpen}
        title="Help"
        onClose={() => setHelpOpen(false)}
        footer={<Button onClick={() => setHelpOpen(false)}>Got it</Button>}
      >
        <p>
          Work down the steps on the left. You can switch the theme with the sun and moon button.
        </p>
      </Modal>
    </div>
  );
}
