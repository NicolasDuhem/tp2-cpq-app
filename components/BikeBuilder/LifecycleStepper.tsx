const steps = ['Start session', 'Configure', 'Finalise', 'Save', 'Retrieve'];

type LifecycleStepperProps = {
  currentStep?: number;
};

export default function LifecycleStepper({ currentStep = 0 }: LifecycleStepperProps) {
  return (
    <div className="lifecycleStepper" aria-label="CPQ lifecycle progress">
      {steps.map((step, index) => {
        const completed = index < currentStep;
        const active = index === currentStep;
        return (
          <div key={step} className="lifecycleStepWrap">
            <div className={`lifecycleStep ${completed ? 'isCompleted' : ''} ${active ? 'isActive' : ''}`}>
              <span className="lifecycleMarker" aria-hidden="true">{completed ? '✓' : ''}</span>
              <span>{step}</span>
            </div>
            {index < steps.length - 1 ? <span className={`lifecycleLine ${completed ? 'isCompleted' : ''}`} aria-hidden="true" /> : null}
          </div>
        );
      })}
    </div>
  );
}
