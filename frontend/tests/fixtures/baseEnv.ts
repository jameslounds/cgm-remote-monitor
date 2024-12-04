const baseEnv = {
  testMode: true,
  settings: {
    alarmHigh: true,
    thresholds: {
      bgHigh: 260,
      bgTargetTop: 180,
      bgTargetBottom: 80,
      bgLow: 55,
    },
    units: "mg/dl",
  },
};

export default baseEnv;
