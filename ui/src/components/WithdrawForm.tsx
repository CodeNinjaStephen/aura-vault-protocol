import { useState, useId, useCallback } from "react";
import type { ToastMessage } from "./Toast";
import { Skeleton } from "./Skeleton";
import { ErrorMessage } from "./ErrorMessage";
import { translateError, type UserError } from "../lib/errors";
import { useUserPosition } from "../hooks/useUserPosition";

interface Props {
  onToast: (msg: ToastMessage) => void;
  /** Connected wallet address — null when no wallet is connected. */
  walletAddress: string | null;
}

export function WithdrawForm({ onToast, walletAddress }: Props) {
  const id = useId();
  const [shares, setShares] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [txError, setTxError] = useState<UserError | null>(null);
  const [loading, setLoading] = useState(false);

  // useUserPosition is keyed by wallet address; null address is a no-op.
  const { data: position, revalidate } = useUserPosition(walletAddress);

  const validate = (val: string) => {
    if (!val || isNaN(Number(val)) || Number(val) <= 0)
      return "Enter a valid share amount greater than 0.";
    return "";
  };

  const submit = useCallback(async () => {
    setTxError(null);
    setLoading(true);
    try {
      // Simulate async contract call — replace with actual Soroban invocation
      await new Promise((r) => setTimeout(r, 1200));

      // Re-fetch user position after a confirmed withdrawal so the share
      // balance shown in the UI is accurate without a full page refresh.
      revalidate();

      setShares("");
      onToast({ type: "success", text: `Withdrew ${shares} shares successfully.` });
    } catch (err) {
      setTxError(translateError(err));
    } finally {
      setLoading(false);
    }
  }, [shares, onToast, revalidate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate(shares);
    if (err) {
      setFieldError(err);
      return;
    }
    setFieldError("");
    submit();
  };

  return (
    <section aria-labelledby={`${id}-title`} className="vault-form">
      <h2 id={`${id}-title`} className="form-title">
        Withdraw
      </h2>

      {/* Show current share balance when wallet is connected */}
      {walletAddress && position && (
        <p className="vault-form__position" aria-live="polite">
          Your shares: <strong>{position.shares.toString()}</strong>
        </p>
      )}

      {loading ? (
        <Skeleton rows={3} />
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor={`${id}-shares`}>Shares</label>
            <input
              id={`${id}-shares`}
              type="number"
              min="0"
              step="any"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              aria-describedby={fieldError ? `${id}-err` : undefined}
              aria-invalid={!!fieldError}
              placeholder="0.00"
              className="input"
            />
            {fieldError && (
              <p id={`${id}-err`} role="alert" className="field-error">
                {fieldError}
              </p>
            )}
          </div>

          {txError && (
            <ErrorMessage
              error={txError}
              onRetry={submit}
              onDismiss={() => setTxError(null)}
            />
          )}

          <button type="submit" className="btn btn--primary">
            Withdraw
          </button>
        </form>
      )}
    </section>
  );
}
