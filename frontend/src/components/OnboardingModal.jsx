import React, { useState } from "react";
import PropTypes from "prop-types";

export default function OnboardingModal({ open, initialSettings = {}, onSave, onClose }) {
  const [values, setValues] = useState({
    os_target: initialSettings.os_target || "90",
    total_orders_target: initialSettings.total_orders_target || "100",
    delivery_failure_threshold: initialSettings.delivery_failure_threshold || "0.15",
    roas_target: initialSettings.roas_target || "2.0",
  });

  if (!open) return null;

  const handleChange = (e) => setValues({ ...values, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (onSave) await onSave(values);
    if (onClose) onClose();
  };

  return (
    <div className="onboarding-backdrop">
      <div className="onboarding-modal">
        <h2>Welcome — let's set up your merchant profile</h2>
        <p>
          Provide a few business defaults (you can change these anytime from Settings). These
          help the AI make better recommendations.
        </p>
        <form onSubmit={handleSubmit}>
          <label>
            Operational Score target (OS %):
            <input name="os_target" value={values.os_target} onChange={handleChange} />
          </label>

          <label>
            Total orders target (7d):
            <input name="total_orders_target" value={values.total_orders_target} onChange={handleChange} />
          </label>

          <label>
            Delivery failure threshold (fraction, e.g. 0.15):
            <input name="delivery_failure_threshold" value={values.delivery_failure_threshold} onChange={handleChange} />
          </label>

          <label>
            ROAS target (e.g. 2.0):
            <input name="roas_target" value={values.roas_target} onChange={handleChange} />
          </label>

          <div className="onboarding-actions">
            <button type="button" onClick={onClose} className="btn-secondary">Skip for now</button>
            <button type="submit" className="btn-primary">Save</button>
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
  onClose: PropTypes.func,
};
