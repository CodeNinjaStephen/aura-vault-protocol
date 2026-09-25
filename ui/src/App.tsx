import { useState, lazy, Suspense } from "react";
import { Toast } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ContractErrorBoundary } from "./components/ContractErrorBoundary";
import { Skeleton } from "./components/Skeleton";
import { OnboardingFlow, hasCompletedOnboarding } from "./components/OnboardingFlow";
import type { ToastMessage } from "./components/Toast";

const DepositForm = lazy(() => import("./components/DepositForm").then((m) => ({ default: m.DepositForm })));
const WithdrawForm = lazy(() => import("./components/WithdrawForm").then((m) => ({ default: m.WithdrawForm })));
const HarvestPanel = lazy(() => import("./components/HarvestPanel").then((m) => ({ default: m.HarvestPanel })));

type Tab = "deposit" | "withdraw" | "harvest";

export default function App() {
  const [tab, setTab] = useState<Tab>("deposit");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !hasCompletedOnboarding()
  );

  // In a real app this would come from a wallet-connection context/hook.
  // Kept as undefined here so the boundary still works without a connected wallet.
  const walletAddress: string | undefined = undefined;

  const notify = (msg: ToastMessage) => setToast(msg);

  return (
    <ErrorBoundary>
      <div className="app">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>

        <header className="app-header" role="banner">
          <h1>Aura Vault</h1>
        </header>

        <main id="main" className="app-main">
          <nav aria-label="Vault actions">
            <div className="tab-list" role="tablist">
              {(["deposit", "withdraw", "harvest"] as Tab[]).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  aria-controls={`panel-${t}`}
                  id={`tab-${t}`}
                  className={`tab-btn${tab === t ? " tab-btn--active" : ""}`}
                  onClick={() => setTab(t)}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </nav>

          <div
            id={`panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`tab-${tab}`}
            className="tab-panel"
          >
            <Suspense fallback={<Skeleton rows={3} />}>
              {tab === "deposit" && (
                <ContractErrorBoundary panelName="deposit" walletAddress={walletAddress}>
                  <DepositForm onToast={notify} />
                </ContractErrorBoundary>
              )}
              {tab === "withdraw" && (
                <ContractErrorBoundary panelName="withdraw" walletAddress={walletAddress}>
                  <WithdrawForm onToast={notify} />
                </ContractErrorBoundary>
              )}
              {tab === "harvest" && (
                <ContractErrorBoundary panelName="harvest" walletAddress={walletAddress}>
                  <HarvestPanel onToast={notify} />
                </ContractErrorBoundary>
              )}
            </Suspense>
          </div>
        </main>

        {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

        {showOnboarding && (
          <OnboardingFlow onComplete={() => setShowOnboarding(false)} />
        )}
      </div>
    </ErrorBoundary>
  );
}
