import { gujaratDistricts, incidentTypeOptions, ReportIncidentValues } from "./civrescue";

// Random utility functions
const getRandomItem = <T>(arr: readonly T[] | T[]): T => arr[Math.floor(Math.random() * arr.length)];
const getRandomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const incidentDescriptions: Record<string, string[]> = {
  Flood: [
    "Severe waterlogging in low-lying residential areas. Several families trapped on rooftops. Urgent boat rescue needed.",
    "River banks overflowed, inundating farms and villages. Immediate food and medical supplies required.",
    "Flash floods washed away a major bridge connecting to the city. Relief teams needed for stranded commuters.",
  ],
  Earthquake: [
    "Major structural damage to several multi-story buildings. Reports of people trapped under debris. Heavy machinery needed urgently.",
    "Roads cracked and power lines down. Panic among residents. Need medical triage teams and temporary shelters.",
    "A school building sustained heavy damage. Several students missing. Search and rescue operations are critical.",
  ],
  Cyclone: [
    "High-speed winds uprooted trees and electric poles. Coastal villages severely affected. Need evacuation assistance.",
    "Roofs blown off houses, heavy rain causing localized flooding. Communication lines are down.",
    "Fishing boats damaged at the harbor. Several fishermen unaccounted for. Coast guard assistance requested.",
  ],
  Heatwave: [
    "Extreme temperatures causing widespread heatstroke cases. Hospitals overwhelmed. Need cooling centers and drinking water stations.",
    "Severe water shortage in the district. Elderly population particularly vulnerable. Urgent medical assistance required.",
  ],
  Fire: [
    "Massive blaze in an industrial chemical plant. Plumes of toxic smoke spreading to nearby residential colonies. Evacuation needed.",
    "A commercial complex caught fire. Several people trapped on upper floors. Fire engines and ambulances required immediately.",
    "Wildfire spreading rapidly towards the village boundaries due to strong winds. Need immediate firefighting support.",
  ],
  Landslide: [
    "A major landslide blocked the national highway. Several vehicles reported buried under mud and rocks. Urgent rescue needed.",
    "Hillside village affected by mudslides after heavy rains. Several houses destroyed. Heavy equipment needed for clearing debris.",
  ],
};

const indianPhoneNumbers = [
  "+91 98765 43210",
  "+91 87654 32109",
  "+91 76543 21098",
  "+91 99887 76655",
  "+91 88776 65544",
];

const getDetailedLocation = (district: string) => {
  const locations = [
    `Near Civil Hospital, ${district}`,
    `Main Market Area, ${district}`,
    `Highway Crossing, ${district}`,
    `${district} Railway Station West`,
    `GIDC Industrial Estate, ${district}`,
    `Old City Center, ${district}`,
  ];
  return getRandomItem(locations);
};

export const generateMockIncident = (): ReportIncidentValues => {
  const emergencyType = getRandomItem(incidentTypeOptions);
  const district = getRandomItem(gujaratDistricts);
  
  // 30% chance of a massive incident (severity 5 / critical trigger)
  const isCritical = Math.random() < 0.3;
  
  const affectedEstimate = isCritical
    ? getRandomInt(10000, 50000) // Huge numbers almost guarantee a 'critical' AI score (> 10k)
    : getRandomInt(10, 500);     // Normal incidents

  return {
    emergencyType,
    location: getDetailedLocation(district),
    description: getRandomItem(incidentDescriptions[emergencyType] || incidentDescriptions["Flood"]),
    affectedEstimate,
    reporterPhone: getRandomItem(indianPhoneNumbers),
  };
};
