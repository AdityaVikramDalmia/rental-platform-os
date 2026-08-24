export interface RentInputs {
  monthlyRent: number;
  depositMonths: number;
  maintenance: number;
  brokerage: number;
}

export interface RentOutputs {
  totalMoveInCost: number;
  monthlyRecurring: number;
  depositAmount: number;
  brokerageAmount: number;
}

export function calculateRentCosts(inputs: RentInputs): RentOutputs {
  const monthlyRent = Math.max(0, inputs.monthlyRent);
  const depositMonths = Math.max(0, inputs.depositMonths);
  const maintenance = Math.max(0, inputs.maintenance);
  const brokeragePercentage = Math.max(0, inputs.brokerage);

  const depositAmount = monthlyRent * depositMonths;
  const brokerageAmount = (monthlyRent * brokeragePercentage) / 100;
  const totalMoveInCost = depositAmount + monthlyRent + brokerageAmount + maintenance;
  const monthlyRecurring = monthlyRent + maintenance;

  return {
    totalMoveInCost,
    monthlyRecurring,
    depositAmount,
    brokerageAmount,
  };
}
