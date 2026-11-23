export const SENSOR_NAMES = {
  sensor_1: "Fan Inlet Temperature (T2)",
  sensor_2: "LPC Outlet Temperature (T24)",
  sensor_3: "HPC Outlet Temperature (T30)",
  sensor_4: "LPT Outlet Temperature (T50)",
  sensor_5: "Fan Inlet Pressure (P2)",
  sensor_6: "Bypass-Duct Pressure (P15)",
  sensor_7: "HPC Outlet Pressure (P30)",
  sensor_8: "Physical Fan Speed (Nf)",
  sensor_9: "Physical Core Speed (Nc)",
  sensor_10: "Engine Pressure Ratio (EPR)",
  sensor_11: "HPC Outlet Static Pressure (Ps30)",
  sensor_12: "Fuel Flow Ratio (phi)",
  sensor_13: "Corrected Fan Speed (NRf)",
  sensor_14: "Corrected Core Speed (NRc)",
  sensor_15: "Bypass Ratio (BPR)",
  sensor_16: "Burner Fuel-Air Ratio (farB)",
  sensor_17: "Bleed Enthalpy (htBleed)",
  sensor_18: "Demanded Fan Speed (Nf_dmd)",
  sensor_19: "Demanded Corrected Fan Speed (PCNfR_dmd)",
  sensor_20: "HPT Coolant Bleed (W31)",
  sensor_21: "LPT Coolant Bleed (W32)",
};

export function sensorDisplayName(sensor) {
  return SENSOR_NAMES[sensor] || sensor;
}
