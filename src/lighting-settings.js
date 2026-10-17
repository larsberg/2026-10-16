import { studioColorFields } from './studio-palettes.js';

// Shared by the drawer and setup API so ranges and saved values agree.
export const lightingGroups = [
  { key: "directional", label: "Directional light", fields: [
    ["enabled", "Enabled", false], ["color", "Color", "#ffffff"],
    ["intensity", "Intensity", 3.2, 0, 10, 0.01],
    ["offsetX", "Offset X", -3, -20, 20, 0.1],
    ["height", "Offset Y", 9, 1, 30, 0.1],
    ["offsetZ", "Offset Z", 5, -20, 20, 0.1],
    ["castShadow", "Cast shadows", true],
    ["softness", "Shadow softness", 6, 0, 16, 0.1],
    ["shadowBias", "Shadow bias", 0, -0.01, 0.01, 0.0001],
    ["normalBias", "Shadow normal bias", 0.025, 0, 0.1, 0.001],
  ] },
  { key: "hemisphere", label: "Hemisphere light", fields: [
    ["enabled", "Enabled", true], ["skyColor", "Sky color", "#ffffff"],
    ["groundColor", "Ground color", "#acaaa6"],
    ["intensity", "Intensity", 2.2, 0, 10, 0.01],
    ["yaw", "Yaw °", 0, -180, 180, 1],
    ["tilt", "Tilt °", 0, 0, 180, 1],
  ] },
  { key: "environment", label: "Environment reflections", fields: [
    ["enabled", "Enabled", true],
    ["intensity", "Intensity", 1, 0, 3, 0.01],
    ["rotation", "Rotation °", 0, -180, 180, 1],
    ...studioColorFields,
  ] },
  { key: "occlusion", label: "Contact shading · GTAO", fields: [
    ["enabled", "Enabled", true],
    ["intensity", "Strength", 1.5, 0, 5, 0.01],
    ["radius", "Radius", 0.8, 0.05, 3, 0.01],
    ["aoOnly", "AO only · preview", false],
  ] },
];

export function defaultLighting() {
  return Object.fromEntries(lightingGroups.map(({ key, fields }) =>
    [key, Object.fromEntries(fields.map(([name, , value]) => [name, value]))]));
}

export function validateLighting(value) {
  const result = defaultLighting();
  for (const { key, fields } of lightingGroups) {
    for (const [name, , initial, min, max] of fields) {
      const field = value?.[key]?.[name];
      if (typeof initial === "number") {
        if (typeof field !== "number" || !Number.isFinite(field) || field < min || field > max)
          throw new Error(`Lighting ${key}.${name} must be between ${min} and ${max}.`);
      } else if (typeof initial === "boolean") {
        if (typeof field !== "boolean") throw new Error(`Lighting ${key}.${name} must be true or false.`);
      } else if (typeof field !== "string" || !/^#[0-9a-f]{6}$/i.test(field)) {
        throw new Error(`Lighting ${key}.${name} must be a six-digit hex color.`);
      }
      result[key][name] = typeof field === "string" ? field.toLowerCase() : field;
    }
  }
  return result;
}
