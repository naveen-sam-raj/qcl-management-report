import React from "react";
import SATankShiftAnalysisPage from "./SATankShiftAnalysisPage";

const P4172AnalysisPage = ({ plantId = "sa" }) => (
  <SATankShiftAnalysisPage
    tankName="P417-2"
    tankKey="sa-p417-2"
    plantId={plantId}
    parameters={[
      { key: "fnh3", label: "FNH3", placeholder: "0.00" },
      { key: "cnh3", label: "CNH3", placeholder: "0.00" },
      { key: "tcl",  label: "TCl",  placeholder: "0.00" },
      { key: "nacl", label: "NaCl", placeholder: "0.00" },
    ]}
  />
);

export default P4172AnalysisPage;
