import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";

const DEFAULT_SETTINGS = {
  os_target: "90",
  total_orders_target: "100",
  delivery_failure_threshold: "0.15",
  roas_target: "2.0",
};

function buildInitialValues(initialSettings = {}) {
  return {
    os_target: String(initialSettings.os_target ?? DEFAULT_SETTINGS.os_target),
    total_orders_target: String(initialSettings.total_orders_target ?? DEFAULT_SETTINGS.total_orders_target),
    delivery_failure_threshold: String(
      initialSettings.delivery_failure_threshold ?? DEFAULT_SETTINGS.delivery_failure_threshold,
    ),
    roas_target: String(initialSettings.roas_target ?? DEFAULT_SETTINGS.roas_target),
  };
}

export default function OnboardingModal({ open, initialSettings = {}, onSave, onSkip, onClose, isFirstTime = true }) {
  const [values, setValues] = useState(buildInitialValues(initialSettings));

  useEffect(() => {
    if (open) {
      setValues(buildInitialValues(initialSettings));
    }
  }, [open, initialSettings]);

  if (!open) return null;

  const handleChange = (e) => setValues({ ...values, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (onSave) await onSave(values);
    if (onClose) onClose();
  };

  const handleSkip = async () => {
    if (onSkip) await onSkip(values);
    if (onClose) onClose();
  };

  return (
    <div className="onboarding-backdrop">
      <div className="onboarding-modal" role="dialog" aria-modal="true" aria-label="Merchant onboarding">
        <div className="onboarding-header">
          <h2>{isFirstTime ? "Welcome — let’s set up your merchant profile" : "Merchant Settings"}</h2>
          <p>
            Set business guardrails so the AI can trigger recommendations with the right thresholds.
            You can update these values anytime.
          </p>
        </div>

        <div className="onboarding-explainers">
          <div className="onboarding-note-card">
            <h3>What is OS?</h3>
            <p>
              Operational Score (OS) is a health indicator for your store’s fulfillment and payment reliability.
              Higher OS means more stable operations.
            </p>
          </div>
          <div className="onboarding-note-card">
            <h3>How to read ROAS</h3>
            <p>
              ROAS = Revenue ÷ Ad Spend. Example: ₹200 revenue on ₹100 spend gives ROAS 2.0x.
              Use this target to flag underperforming campaigns.
            </p>
          </div>
        </div>

        <form className="onboarding-form" onSubmit={handleSubmit}>
          <label className="onboarding-field">
            <span>Operational Score target (OS %)</span>
            <input name="os_target" value={values.os_target} onChange={handleChange} />
          </label>

          <label className="onboarding-field">
            <span>Total orders target (7d)</span>
            <input name="total_orders_target" value={values.total_orders_target} onChange={handleChange} />
          </label>

          <label className="onboarding-field">
            <span>Delivery failure threshold (fraction, e.g. 0.15)</span>
            <input name="delivery_failure_threshold" value={values.delivery_failure_threshold} onChange={handleChange} />
          </label>

          <label className="onboarding-field">
            <span>ROAS target (e.g. 2.0)</span>
            <input name="roas_target" value={values.roas_target} onChange={handleChange} />
          </label>

          <div className="onboarding-actions">
            <button type="button" onClick={handleSkip} className="onboarding-btn-secondary">
              {isFirstTime ? "Skip & Use Defaults" : "Cancel"}
            </button>
            <button type="submit" className="onboarding-btn-primary">Save Values</button>
          </div>
        </form>
      </div>
    </div>
  );
}

OnboardingModal.propTypes = {
  open: PropTypes.bool,
  initialSettings: PropTypes.object,
  onSave: PropTypes.func,
  onSkip: PropTypes.func,
  onClose: PropTypes.func,
  isFirstTime: PropTypes.bool,
};
