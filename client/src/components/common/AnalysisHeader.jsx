import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Factory, ChevronRight, Layers, Calendar, Lock } from 'lucide-react';
import { StatusSaveButton } from './AnalysisStatusBanner';
import { formatDateDisplay } from '../../utils/co2AnalysisHelper';

/**
 * Unified Analysis Page Header Bar
 * Matching reference styling from PclTclAnalysisPage:
 * - Back button with rounded-lg border and ArrowLeft icon
 * - Breadcrumb: Plant Name > Analysis Name (+ optional extra breadcrumb/badge)
 * - Title: Bold tracking-tight header
 * - Date section: Standardized "Date: *" input with Calendar icon, "Operating Day (Asia/Kolkata)" badge, and (Weekday, Date) label
 * - Actions: StatusSaveButton or "Read-Only View" badge
 */
const AnalysisHeader = ({
  plantName = 'Plant',
  analysisName = 'Analysis',
  title,
  extraBreadcrumb = null,
  plantIcon = null,
  analysisIcon = null,
  date,
  onDateChange,
  isDateLocked = true,
  maxDate,
  minDate,
  dateId = 'analysis-date-display',
  badgeText = 'Operating Day',
  onBack,
  onSave,
  saving = false,
  savePhase = 'idle',
  saveSuccess = false,
  disabled = false,
  isViewOnly = false,
  saveButtonId = 'btn-analysis-save',
  saveButtonTitle = 'Save analysis data',
  saveButtonLabel = 'Save / Submit',
  alwaysShowSaveText = true,
  customActions = null,
  customDateSection = null,
}) => {
  const navigate = useNavigate();

  const handleBack = onBack || (() => navigate(-1));
  const displayTitle =
    title ||
    (typeof analysisName === 'string'
      ? `${analysisName.toUpperCase()} ANALYSIS`
      : analysisName);

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs px-5 py-3.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Left: Back button + Breadcrumb + Title */}
        <div className="flex items-center gap-3.5 min-w-0">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 font-bold text-xs transition shadow-2xs shrink-0 cursor-pointer"
            title="Back"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
            <span>Back</span>
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium leading-tight">
              {plantIcon || <Factory className="w-3.5 h-3.5 text-slate-400" />}
              <span>{plantName}</span>
              <ChevronRight className="w-3 h-3" />
              {analysisIcon || <Layers className="w-3.5 h-3.5 text-blue-500" />}
              <span className="text-blue-600 font-semibold">{analysisName}</span>
              {extraBreadcrumb}
            </div>
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">
              {displayTitle}
            </h1>
          </div>
        </div>

        {/* Right Section: Date + Actions */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          {customDateSection ? (
            customDateSection
          ) : date ? (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg shadow-2xs">
              <label
                htmlFor={dateId}
                className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1"
              >
                <span>Date:</span>
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id={dateId}
                  type="date"
                  value={date}
                  readOnly={isDateLocked}
                  disabled={isDateLocked}
                  onChange={!isDateLocked ? onDateChange : undefined}
                  max={maxDate}
                  min={minDate}
                  className={`pl-7 pr-2 py-1 text-xs font-semibold border rounded-md border-slate-300 ${
                    isDateLocked
                      ? 'bg-slate-100 text-slate-700 cursor-not-allowed select-none'
                      : 'bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer'
                  }`}
                  title={
                    isDateLocked
                      ? `Date is locked to ${badgeText} (Asia/Kolkata timezone)`
                      : 'Select Date'
                  }
                />
              </div>
              <span className="text-xs font-bold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded border border-blue-200 hidden sm:inline-block">
                {badgeText} (Asia/Kolkata)
              </span>
              {date && (
                <span className="text-[11px] text-slate-600 font-medium hidden md:inline-block">
                  ({formatDateDisplay(date)})
                </span>
              )}
            </div>
          ) : null}

          {/* Actions: Save / Submit or Read-Only */}
          {customActions ? (
            customActions
          ) : isViewOnly ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-500 text-xs font-semibold">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>Read-Only View</span>
            </div>
          ) : onSave ? (
            <div className="flex items-center gap-2">
              <StatusSaveButton
                id={saveButtonId}
                saving={saving}
                savePhase={savePhase}
                saveSuccess={saveSuccess}
                onClick={onSave}
                disabled={disabled}
                alwaysShowSaveText={alwaysShowSaveText}
                defaultLabel={saveButtonLabel}
                title={saveButtonTitle}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default AnalysisHeader;

