function CurveDivider({ fill, flip = false, className = "" }) {
  return (
    <div className={`pointer-events-none w-full overflow-hidden leading-none ${className}`} aria-hidden="true">
      <svg
        viewBox="0 0 1440 100"
        preserveAspectRatio="none"
        className={`h-16 w-full sm:h-24 ${flip ? "-scale-y-100" : ""}`}
      >
        <path
          d="M0,32 C 220,90 380,0 620,38 C 900,82 1120,4 1440,46 L1440,100 L0,100 Z"
          fill={fill}
        />
      </svg>
    </div>
  );
}

export default CurveDivider;
