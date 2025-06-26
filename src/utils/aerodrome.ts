export const tickSpacingToFee = (tickSpacing: number): number => {
  switch (tickSpacing) {
    case 1:
      return 100; // 1 bps = 0.01% = 100
    case 50:
      return 500; // 5 bps = 0.05% = 500
    case 100:
      return 500; // 5 bps = 0.05% = 500
    case 200:
      return 3000; // 30 bps = 0.3% = 3000
    case 2000:
      return 10000; // 100 bps = 1% = 10000
    default:
      throw new Error(`Unsupported tick spacing: ${tickSpacing}`);
  }
};
