document.addEventListener("DOMContentLoaded", () => {
    // API base URL (empty for relative paths since frontend is hosted on the same port)
    const API_BASE = "";

    // App state
    let auditData = null;
    let uploadedFiles = {
        as26: null,
        comp: null,
        itr: null,
        itr5: null,
        audit: null,
        ais: null,
        xlsx: null,
        sub: null
    };

    // DOM Elements
    const navItems = document.querySelectorAll(".nav-item");
    const tabPanes = document.querySelectorAll(".tab-pane");
    const currentViewName = document.getElementById("current-view-name");
    const loadingSpinner = document.getElementById("loading-spinner");
    const loaderText = document.getElementById("loader-text");
    const btnExportExcel = document.getElementById("btn-export-excel");
    const searchBsPl = document.getElementById("search-bs-pl");
    const btnProcessReview = document.getElementById("btn-process-review");
    const btnResetData = document.getElementById("btn-reset-data");
    const btnResetTop = document.getElementById("btn-reset-top");

    // Tab Switching
    navItems.forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const tabId = item.getAttribute("data-tab");

            // Update active states
            navItems.forEach(n => n.classList.remove("active"));
            tabPanes.forEach(tp => tp.classList.remove("active"));

            item.classList.add("active");
            const targetPane = document.getElementById(tabId);
            if (targetPane) targetPane.classList.add("active");

            // Update header breadcrumb
            currentViewName.textContent = item.querySelector("span").textContent;
        });
    });

    // File Upload Drag and Drop & Browsing Event Listeners
    const uploadConfigs = [
        { type: "as26", boxId: "box-as26", inputId: "file-as26" },
        { type: "comp", boxId: "box-comp", inputId: "file-comp" },
        { type: "itr", boxId: "box-itr", inputId: "file-itr" },
        { type: "itr5", boxId: "box-itr5", inputId: "file-itr5" },
        { type: "audit", boxId: "box-audit", inputId: "file-audit" },
        { type: "ais", boxId: "box-ais", inputId: "file-ais" },
        { type: "xlsx", boxId: "box-xlsx", inputId: "file-xlsx" },
        { type: "sub", boxId: "box-sub", inputId: "file-sub" }
    ];

    uploadConfigs.forEach(cfg => {
        const box = document.getElementById(cfg.boxId);
        const input = document.getElementById(cfg.inputId);
        if (!box || !input) return;

        // Prevent click on input from bubbling to box (which would cause double-click/cancel)
        input.addEventListener("click", (e) => {
            e.stopPropagation();
        });

        // Click on box triggers input file dialog
        box.addEventListener("click", (e) => {
            if (e.target !== input) {
                input.click();
            }
        });

        // Prevent default drag events
        ["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
            box.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        // Toggle hover drag class
        ["dragenter", "dragover"].forEach(eventName => {
            box.addEventListener(eventName, () => box.classList.add("dragover"), false);
        });
        ["dragleave", "drop"].forEach(eventName => {
            box.addEventListener(eventName, () => box.classList.remove("dragover"), false);
        });

        // Handle drop event
        box.addEventListener("drop", (e) => {
            const dt = e.dataTransfer;
            const files = dt ? dt.files : null;
            if (files && files.length > 0) {
                handleFileUpload(cfg.type, files[0], box);
            }
        });

        // Handle file browse select
        input.addEventListener("change", (e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                const selectedFile = files[0];
                handleFileUpload(cfg.type, selectedFile, box);
                // Clear input value so selecting the same file again triggers change event
                input.value = "";
            }
        });
    });

    // Toast Notification System
    const showToast = (message, type = "success", duration = 3500) => {
        let container = document.getElementById("toast-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "toast-container";
            container.className = "toast-container";
            document.body.appendChild(container);
        }
        const toast = document.createElement("div");
        toast.className = `toast-item toast-${type}`;
        const icon = type === "success" ? "fa-circle-check" : (type === "error" ? "fa-circle-xmark" : "fa-circle-info");
        toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => toast.classList.add("show"), 10);
        setTimeout(() => {
            toast.classList.remove("show");
            setTimeout(() => toast.remove(), 300);
        }, duration);
    };

    // Upload file to FastAPI backend
    const handleFileUpload = async (docType, file, boxElement) => {
        const formData = new FormData();
        formData.append("file", file);

        const statusBadge = boxElement.querySelector(".upload-status-badge");
        if (statusBadge) {
            statusBadge.textContent = "Uploading...";
            statusBadge.className = "upload-status-badge status-pending";
        }

        try {
            const response = await fetch(`${API_BASE}/api/upload/${docType}`, {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || "Upload failed");
            }

            const result = await response.json();
            boxElement.classList.add("uploaded");
            if (statusBadge) {
                statusBadge.textContent = "Ready (Uploaded)";
                statusBadge.className = "upload-status-badge status-success";
            }

            uploadedFiles[docType] = file;
            showToast(`${file.name} uploaded successfully!`, "success");

            // Refresh reconciliation data on upload
            await loadDashboardData();

        } catch (error) {
            console.error("Upload error:", error);
            boxElement.classList.remove("uploaded");
            if (statusBadge) {
                statusBadge.textContent = "Failed";
                statusBadge.className = "upload-status-badge status-pending";
            }
            showToast(`Upload failed: ${error.message}`, "error");
        }
    };

    // Trigger full review & calculation process
    btnProcessReview.addEventListener("click", async () => {
        showLoader(true, "Running Senior CA Audit & Statutory Rule 12 Review Engine...");
        
        try {
            const response = await fetch(`${API_BASE}/api/process`, {
                method: "POST"
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || "Processing failed");
            }

            const result = await response.json();
            if (result.status === "success") {
                await loadDashboardData(result.data);
                showLoader(false);
                showToast("Statutory review & ITR validation complete! Workpapers updated.", "success");
            }
        } catch (error) {
            console.error("Processing error:", error);
            showLoader(false);
            showToast(`Processing failed: ${error.message}`, "error");
        }
    });

    // Helpers
    const formatCurrency = (val) => {
        if (val === undefined || val === null) return "—";
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 2
        }).format(val);
    };

    // Load Data from backend API
    const loadDashboardData = async (preloadedData = null) => {
        try {
            if (preloadedData) {
                auditData = preloadedData;
            } else {
                const response = await fetch(`${API_BASE}/api/data`);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                auditData = await response.json();
            }
            
            // Populate metrics & views
            populateMetrics();
            renderItrValidation();
            renderIncomeClassification();
            renderExpenseDisallowance();
            renderExemptIncome();
            renderTaxRegime();
            renderTaxComputation();
            renderTds26asReconciliation();
            renderTdsCarryForward();
            renderBsPlMappingReview();
            renderMasterLog();
            renderForm26AS();
            renderAisTis();
            renderBsPlMapping();
            renderIncomeRec();
            renderForm3CD();
            renderPriorYear();
            renderSummary();
            
            // Update manual upload box badges based on files present on the server
            updateUploadStatuses();
            
        } catch (error) {
            console.error("Error loading dashboard data:", error);
        }
    };

    // Render ITR Form Validation & Rule 12 Statutory Head Check
    const renderItrValidation = () => {
        if (!auditData) return;
        const val = auditData.itr_validation || {};
        const profile = auditData.assessee_profile || {};

        const formMentionedEl = document.getElementById("val-form-mentioned");
        const formRecommendedEl = document.getElementById("val-form-recommended");
        const verdictBanner = document.getElementById("val-verdict-banner");
        const verdictIcon = document.getElementById("val-verdict-icon");
        const verdictTitle = document.getElementById("val-verdict-title");
        const verdictDesc = document.getElementById("val-verdict-desc");

        const nameEl = document.getElementById("val-name");
        const panStatusEl = document.getElementById("val-pan-status");
        const ayEl = document.getElementById("val-ay");
        const resStatusEl = document.getElementById("val-res-status");
        const gtiEl = document.getElementById("val-gti");
        const totalIncomeEl = document.getElementById("val-total-income");

        const headsGrid = document.getElementById("val-heads-grid");
        const specialCondsEl = document.getElementById("val-special-conds");
        const reasoningList = document.getElementById("val-reasoning-list");
        const riskNoteEl = document.getElementById("val-risk-note");

        // Profile Strip
        if (nameEl) nameEl.textContent = val.assessee_name || profile.assessee_name || "—";
        if (panStatusEl) panStatusEl.textContent = `${val.pan || profile.pan || '—'} (${val.status || profile.status || 'Individual'})`;
        if (ayEl) ayEl.textContent = val.assessment_year || profile.assessment_year || "2026-27";
        if (resStatusEl) resStatusEl.textContent = val.residential_status || profile.residential_status || "Resident";
        if (gtiEl) gtiEl.textContent = typeof val.gross_total_income === "number" ? formatCurrency(val.gross_total_income) : (typeof profile.gross_total_income === "number" ? formatCurrency(profile.gross_total_income) : "—");
        if (totalIncomeEl) totalIncomeEl.textContent = typeof val.total_income === "number" ? formatCurrency(val.total_income) : (typeof profile.total_income === "number" ? formatCurrency(profile.total_income) : "—");

        const formMentioned = val.form_mentioned || "ITR-5";
        const formRecommended = val.form_recommended || "ITR-5";
        const isCorrect = val.is_correct !== undefined ? val.is_correct : (formMentioned === formRecommended);

        if (formMentionedEl) formMentionedEl.textContent = formMentioned;
        if (formRecommendedEl) formRecommendedEl.textContent = formRecommended;

        if (verdictBanner) {
            if (isCorrect) {
                verdictBanner.className = "itr-verdict-banner verdict-compliant";
                if (verdictIcon) verdictIcon.className = "fa-solid fa-circle-check";
                if (verdictTitle) verdictTitle.textContent = `COMPLIANT — Correct Return Form Selected (${formMentioned})`;
                if (verdictDesc) verdictDesc.textContent = `The provided form ${formMentioned} matches the statutory applicability criteria under Rule 12 of the Income-tax Rules, 1962 for ${val.status || 'this assessee'}.`;
            } else {
                verdictBanner.className = "itr-verdict-banner verdict-defective";
                if (verdictIcon) verdictIcon.className = "fa-solid fa-triangle-exclamation";
                if (verdictTitle) verdictTitle.textContent = `NON-COMPLIANT / DEFECTIVE RETURN WARNING u/s 139(9)`;
                if (verdictDesc) verdictDesc.textContent = `Assessee has selected ${formMentioned}, but the legal provisions require ${formRecommended}. Filing with an incorrect form will result in a Defective Return notice u/s 139(9) or rejection by CPC Bangalore.`;
            }
        }

        // Heads of Income Breakdown
        if (headsGrid) {
            headsGrid.innerHTML = "";
            const heads = val.heads_breakdown || [
                { head_no: 1, name: "Income from Salaries", present: false, amount: 0.0, applicability_rule: "Permitted in ITR-1 to ITR-4. Excluded from ITR-5/ITR-6." },
                { head_no: 2, name: "Income from House Property", present: false, amount: 0.0, applicability_rule: "Single property permitted in ITR-1. Multiple properties mandate ITR-2/3/5/6." },
                { head_no: 3, name: "Profits & Gains of Business / PGBP", present: true, amount: 866176.0, applicability_rule: "Strict disqualifier for ITR-1 & ITR-2. Mandates ITR-3 (Individuals), ITR-4 (Presumptive), ITR-5 (LLP/Firm), or ITR-6 (Company)." },
                { head_no: 4, name: "Capital Gains (STCG / LTCG)", present: false, amount: 0.0, applicability_rule: "Disqualifier for ITR-1/4. Mandates ITR-2 (non-business), ITR-3, ITR-5, or ITR-6." },
                { head_no: 5, name: "Income from Other Sources", present: true, amount: 13254980.0, applicability_rule: "Permitted across all ITRs. Special rate winnings exclude ITR-1/4." }
            ];

            heads.forEach(h => {
                const card = document.createElement("div");
                card.className = `head-card ${h.present ? 'active-head' : ''}`;
                card.innerHTML = `
                    <div>
                        <div class="head-card-top">
                            <span class="head-num-badge">Head ${h.head_no}</span>
                            <span class="head-status-pill ${h.present ? 'active' : 'inactive'}">${h.present ? 'Included in Comp' : 'NIL / Not Present'}</span>
                        </div>
                        <div class="head-name">${h.name}</div>
                        <div class="head-amount ${h.present ? 'has-val' : ''}">${h.present ? formatCurrency(h.amount) : '₹0.00 (NIL)'}</div>
                    </div>
                    <div class="head-rule-note"><i class="fa-solid fa-scale-balanced" style="font-size:10px; margin-right:4px; opacity:0.7;"></i>${h.applicability_rule}</div>
                `;
                headsGrid.appendChild(card);
            });
        }

        // Special Conditions
        if (specialCondsEl) {
            specialCondsEl.innerHTML = "";
            const conds = val.special_conditions || ["Standard Disclosures"];
            conds.forEach(c => {
                const span = document.createElement("span");
                span.className = "badge";
                span.style = "background: #1e293b; color: #94a3b8; border: 1px solid rgba(255,255,255,0.08); padding: 5px 12px; font-size: 11.5px;";
                span.innerHTML = `<i class="fa-solid fa-tag" style="font-size:10px; margin-right:5px; color:var(--primary);"></i> ${c}`;
                specialCondsEl.appendChild(span);
            });
        }

        // Statutory Reasoning List
        if (reasoningList) {
            reasoningList.innerHTML = "";
            const reasons = val.reasoning || [];
            if (reasons.length === 0) {
                reasoningList.innerHTML = '<li>Rule 12 statutory criteria satisfied.</li>';
            } else {
                reasons.forEach(r => {
                    const li = document.createElement("li");
                    li.style.marginBottom = "6px";
                    li.textContent = r;
                    reasoningList.appendChild(li);
                });
            }
        }

        // Risk Note
        if (riskNoteEl) {
            riskNoteEl.textContent = val.risk_note || "Compliant. The return form matches statutory applicability.";
            if (!isCorrect) {
                riskNoteEl.style.color = "var(--danger)";
                riskNoteEl.style.fontWeight = "500";
            } else {
                riskNoteEl.style.color = "var(--text-muted)";
                riskNoteEl.style.fontWeight = "normal";
            }
        }
    };

    // Render Head of Income Classification & Statutory Review (P&L vs Tax Computation)
    let currentIncFilter = "all";
    let currentIncSearch = "";

    const renderIncomeClassification = () => {
        if (!auditData) return;
        const incData = auditData.income_head_review || {};
        const metrics = incData.accuracy_metrics || {};
        const headsDist = incData.heads_distribution || {};
        const tableData = incData.classification_table || [];
        const risks = incData.misclassification_risks || [];
        const opinion = incData.professional_opinion || {};

        // 1. Accuracy Metric Hero
        const accuracyValEl = document.getElementById("inc-accuracy-val");
        const verdictPill = document.getElementById("inc-verdict-pill");
        const statTotalEl = document.getElementById("inc-stat-total");
        const statCorrectEl = document.getElementById("inc-stat-correct");
        const statReviewEl = document.getElementById("inc-stat-review");

        const accuracyPct = metrics.accuracy_percentage !== undefined ? metrics.accuracy_percentage : 100.0;
        const totalCount = metrics.total_count || tableData.length;
        const correctCount = metrics.correct_count || tableData.filter(t => t.status === "Correct").length;
        const reviewCount = metrics.review_count || tableData.filter(t => t.status !== "Correct").length;
        const totalAmt = incData.total_ledger_amount || tableData.reduce((acc, it) => acc + (it.amount || 0), 0);

        if (accuracyValEl) {
            accuracyValEl.textContent = `${accuracyPct}%`;
            if (accuracyPct >= 90) {
                accuracyValEl.style.color = "var(--success)";
            } else if (accuracyPct >= 75) {
                accuracyValEl.style.color = "var(--warning)";
            } else {
                accuracyValEl.style.color = "var(--danger)";
            }
        }

        if (verdictPill) {
            if (reviewCount === 0 && totalCount > 0) {
                verdictPill.className = "badge";
                verdictPill.style = "background: rgba(16, 185, 129, 0.18); color: #34d399; font-size: 11.5px; padding: 4px 12px; border-radius: 20px;";
                verdictPill.innerHTML = '<i class="fa-solid fa-circle-check"></i> 100% Correctly Classified';
            } else if (totalCount > 0) {
                verdictPill.className = "badge";
                verdictPill.style = "background: rgba(245, 158, 11, 0.18); color: #fbbf24; font-size: 11.5px; padding: 4px 12px; border-radius: 20px;";
                verdictPill.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${reviewCount} Item(s) Require CA Action`;
            } else {
                verdictPill.className = "badge";
                verdictPill.style = "background: rgba(100, 116, 139, 0.2); color: #94a3b8; font-size: 11.5px; padding: 4px 12px; border-radius: 20px;";
                verdictPill.textContent = "Awaiting Data Upload";
            }
        }

        if (statTotalEl) statTotalEl.textContent = totalCount > 0 ? formatCurrency(totalAmt) : "—";
        if (statCorrectEl) statCorrectEl.textContent = totalCount > 0 ? `${correctCount} / ${totalCount} Items` : "—";
        if (statReviewEl) statReviewEl.textContent = totalCount > 0 ? `${reviewCount} Flagged` : "—";

        // Counts for filter buttons
        const countAll = document.getElementById("count-inc-all");
        const countCorrect = document.getElementById("count-inc-correct");
        const countReview = document.getElementById("count-inc-review");
        if (countAll) countAll.textContent = totalCount;
        if (countCorrect) countCorrect.textContent = correctCount;
        if (countReview) countReview.textContent = reviewCount;

        // 2. 5 Statutory Heads & Exempt Distribution
        const headsGrid = document.getElementById("inc-heads-distribution-grid");
        if (headsGrid) {
            headsGrid.innerHTML = "";
            const headsConfig = [
                { head_no: "Head 1", name: "Salaries (Sec 15-17)", amount: headsDist.salary || 0.0, icon: "fa-user-tie" },
                { head_no: "Head 2", name: "House Property (Sec 22-27)", amount: headsDist.house_property || 0.0, icon: "fa-building-columns" },
                { head_no: "Head 3", name: "PGBP Business Profit (Sec 28)", amount: headsDist.pgbp || 0.0, icon: "fa-briefcase" },
                { head_no: "Head 4", name: "Capital Gains (Sec 45-55A)", amount: headsDist.capital_gains || 0.0, icon: "fa-chart-line" },
                { head_no: "Head 5", name: "Income from Other Sources (Sec 56)", amount: headsDist.other_sources || 0.0, icon: "fa-money-bill-transfer" },
                { head_no: "Exempt", name: "Exempt Income (Sec 10 / 10(2A))", amount: headsDist.exempt_income || 0.0, icon: "fa-shield-heart" }
            ];

            headsConfig.forEach(h => {
                const hasAmt = h.amount > 0;
                const card = document.createElement("div");
                card.className = `head-card ${hasAmt ? 'active-head' : ''}`;
                card.style = `background: ${hasAmt ? 'rgba(30, 41, 59, 0.7)' : 'rgba(15, 23, 42, 0.4)'}; border: 1px solid ${hasAmt ? 'var(--primary)' : 'var(--border-color)'}; border-radius: 12px; padding: 14px 16px; display:flex; flex-direction:column; justify-content:space-between;`;
                card.innerHTML = `
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                            <span style="font-size:10.5px; font-weight:700; text-transform:uppercase; color: ${hasAmt ? 'var(--primary)' : 'var(--text-muted)'}; letter-spacing:0.5px;"><i class="fa-solid ${h.icon}" style="margin-right:4px;"></i> ${h.head_no}</span>
                            <span class="badge" style="font-size:10px; padding:2px 8px; ${hasAmt ? 'background:rgba(99,102,241,0.18);color:#818cf8;' : 'background:#1e293b;color:#64748b;'}">${hasAmt ? 'Active' : 'NIL'}</span>
                        </div>
                        <div style="font-size:12.5px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${h.name}</div>
                    </div>
                    <div style="font-size:15px; font-weight:700; color:${hasAmt ? 'var(--success)' : 'var(--text-muted)'}; margin-top:4px;">${hasAmt ? formatCurrency(h.amount) : '₹0.00'}</div>
                `;
                headsGrid.appendChild(card);
            });
        }

        // 3. Render 9-Column Master Review Table
        renderIncomeClassificationTable(tableData);

        // 4. Render Misclassification Risks Deep-Dive Grid
        const risksGrid = document.getElementById("inc-risks-grid");
        if (risksGrid) {
            risksGrid.innerHTML = "";
            if (risks.length === 0) {
                risksGrid.innerHTML = '<div style="color:var(--text-muted);font-style:italic;">No misclassification risks flagged.</div>';
            } else {
                risks.forEach(r => {
                    const card = document.createElement("div");
                    const isHigh = r.risk_level === "High";
                    const isMed = r.risk_level === "Medium";
                    const badgeBg = isHigh ? "rgba(239, 68, 68, 0.15)" : (isMed ? "rgba(245, 158, 11, 0.15)" : "rgba(16, 185, 129, 0.15)");
                    const badgeColor = isHigh ? "#f87171" : (isMed ? "#fbbf24" : "#34d399");

                    card.style = `background: rgba(30, 41, 59, 0.45); border: 1px solid ${isHigh ? 'rgba(239,68,68,0.3)' : 'var(--border-color)'}; border-radius: 12px; padding: 18px; display:flex; flex-direction:column; justify-content:space-between;`;
                    card.innerHTML = `
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:10px;">
                                <span style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--primary); letter-spacing:0.5px;">${r.category}</span>
                                <span class="badge" style="background:${badgeBg}; color:${badgeColor}; font-size:11px; padding:2px 8px; font-weight:600;">${r.risk_level}</span>
                            </div>
                            <h5 style="font-size:13.5px; color:var(--text-main); margin-bottom:8px; font-weight:600;">${r.risk_title}</h5>
                            <p style="font-size:12px; color:var(--text-muted); line-height:1.55; margin-bottom:10px;">${r.observation}</p>
                        </div>
                        <div style="border-top:1px solid rgba(255,255,255,0.06); padding-top:10px; margin-top:6px;">
                            <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px;"><strong style="color:var(--text-main);">Statutory Provision:</strong> <span style="color:var(--primary);">${r.statutory_reference}</span></div>
                            <div style="font-size:11.5px; color:var(--text-main);"><strong style="color:var(--success);">CA Advice:</strong> ${r.ca_advice}</div>
                        </div>
                    `;
                    risksGrid.appendChild(card);
                });
            }
        }

        // 5. Render Step 7 Professional Opinion
        const opinionText = document.getElementById("inc-opinion-text");
        const clarificationsList = document.getElementById("inc-clarifications-list");
        const correctionsList = document.getElementById("inc-corrections-list");
        const sectionsChips = document.getElementById("inc-sections-chips");

        if (opinionText) {
            opinionText.textContent = opinion.overall_opinion || "No opinion generated yet. Awaiting data upload.";
        }

        if (clarificationsList) {
            clarificationsList.innerHTML = "";
            const clList = opinion.clarifications_required_from_assessee || [];
            if (clList.length === 0) {
                clarificationsList.innerHTML = '<li style="color:var(--text-muted);font-style:italic;">No additional clarifications needed at this stage.</li>';
            } else {
                clList.forEach(cl => {
                    const li = document.createElement("li");
                    li.style.marginBottom = "6px";
                    li.textContent = cl;
                    clarificationsList.appendChild(li);
                });
            }
        }

        if (correctionsList) {
            correctionsList.innerHTML = "";
            const coList = opinion.suggested_corrections || [];
            if (coList.length === 0) {
                correctionsList.innerHTML = '<li style="color:var(--text-muted);font-style:italic;">No corrective entries required. Returns are in order.</li>';
            } else {
                coList.forEach(co => {
                    const li = document.createElement("li");
                    li.style.marginBottom = "6px";
                    li.textContent = co;
                    correctionsList.appendChild(li);
                });
            }
        }

        if (sectionsChips) {
            sectionsChips.innerHTML = "";
            const sections = opinion.relevant_sections || [];
            sections.forEach(sec => {
                const chip = document.createElement("span");
                chip.className = "badge";
                chip.style = "background: #1e293b; color: #cbd5e1; border: 1px solid rgba(255,255,255,0.08); padding: 5px 12px; font-size: 11.5px;";
                chip.innerHTML = `<i class="fa-solid fa-gavel" style="color:var(--primary); font-size:10px; margin-right:5px;"></i> ${sec}`;
                sectionsChips.appendChild(chip);
            });
        }
    };

    // Render Table helper for filtering & search
    const renderIncomeClassificationTable = (tableData) => {
        const tableBody = document.querySelector("#table-income-classification tbody");
        if (!tableBody) return;

        if (!tableData || tableData.length === 0) {
            renderEmptyStateRow(tableBody, 9);
            return;
        }

        tableBody.innerHTML = "";

        // Filter & Search
        const filtered = tableData.filter(item => {
            // Category filter
            if (currentIncFilter === "correct" && item.status !== "Correct") return false;
            if (currentIncFilter === "review" && item.status === "Correct") return false;
            if (currentIncFilter === "exempt" && !item.correct_tax_head.toLowerCase().includes("exempt")) return false;

            // Search filter
            if (currentIncSearch) {
                const q = currentIncSearch.toLowerCase();
                const matchName = (item.ledger_name || "").toLowerCase().includes(q);
                const matchHead = (item.correct_tax_head || "").toLowerCase().includes(q);
                const matchIssue = (item.issue_identified || "").toLowerCase().includes(q);
                const matchSec = (item.statutory_section || "").toLowerCase().includes(q);
                const matchComp = (item.computation_treatment || "").toLowerCase().includes(q);
                return matchName || matchHead || matchIssue || matchSec || matchComp;
            }
            return true;
        });

        if (filtered.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 35px; color: var(--text-muted);">
                        <i class="fa-solid fa-filter-circle-xmark" style="font-size: 24px; margin-bottom: 8px; display: block; opacity: 0.5;"></i>
                        No income ledgers match the current filter / search criteria.
                    </td>
                </tr>
            `;
            return;
        }

        filtered.forEach(row => {
            const tr = document.createElement("tr");
            const isCorrect = row.status === "Correct";
            const isReview = row.status === "Requires Review";
            const statusBadgeClass = isCorrect ? "status-matched" : (isReview ? "status-discrepancy" : "status-discrepancy");
            const statusIcon = isCorrect ? "fa-circle-check" : "fa-triangle-exclamation";

            tr.innerHTML = `
                <td style="text-align:center; font-weight:600; color:var(--text-muted);">${row.sr_no || '—'}</td>
                <td>
                    <strong style="color:var(--text-main); display:block; font-size:13px;">${row.ledger_name}</strong>
                    <span style="font-size:11px; color:var(--text-muted);">${row.nature || ''}</span>
                </td>
                <td style="text-align:right; font-weight:600; color:var(--text-main); font-family:monospace; font-size:13px;">${formatCurrency(row.amount)}</td>
                <td style="font-size:12.5px; color:var(--text-muted);">${row.book_treatment}</td>
                <td style="font-size:12.5px; color:var(--text-main);">${row.computation_treatment}</td>
                <td>
                    <strong style="font-size:12.5px; color:var(--primary); display:block;">${row.correct_tax_head}</strong>
                    ${row.statutory_section ? `<span class="badge" style="background:#1e293b; font-size:10px; color:#94a3b8; margin-top:2px;">${row.statutory_section}</span>` : ''}
                </td>
                <td style="text-align:center;">
                    <span class="status-badge ${statusBadgeClass}" style="display:inline-flex; align-items:center; gap:4px; font-size:11px; padding:3px 8px;">
                        <i class="fa-solid ${statusIcon}"></i> ${row.status}
                    </span>
                </td>
                <td style="font-size:12px; color:var(--text-main); line-height:1.5;">${row.issue_identified}</td>
                <td style="font-size:12px; color: ${isCorrect ? 'var(--text-muted)' : 'var(--warning)'}; line-height:1.5; font-weight: ${isCorrect ? 'normal' : '500'};">${row.suggested_correction}</td>
            `;
            tableBody.appendChild(tr);
        });
    };

    // Filter Buttons and Search Handlers for Income Classification Table
    const filterButtonsContainer = document.getElementById("inc-filter-buttons");
    if (filterButtonsContainer) {
        const fBtns = filterButtonsContainer.querySelectorAll("button");
        fBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                fBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                currentIncFilter = btn.getAttribute("data-filter") || "all";
                if (auditData && auditData.income_head_review) {
                    renderIncomeClassificationTable(auditData.income_head_review.classification_table || []);
                }
            });
        });
    }

    const searchIncInput = document.getElementById("search-inc-table");
    if (searchIncInput) {
        searchIncInput.addEventListener("input", (e) => {
            currentIncSearch = e.target.value.trim();
            if (auditData && auditData.income_head_review) {
                renderIncomeClassificationTable(auditData.income_head_review.classification_table || []);
            }
        });
    }

    // =========================================================================
    // Render Statutory Expense Disallowances & Add-back Review (P&L vs Comp)
    // =========================================================================
    let currentExpFilter = "all";
    let currentExpSearch = "";

    const renderExpenseDisallowance = () => {
        if (!auditData) return;
        const expData = auditData.expense_disallowance_review || {};
        const metrics = expData.summary_metrics || {};
        const provMatrix = expData.provisions_matrix || [];
        const tableData = expData.exception_table || [];
        const conclusion = expData.professional_conclusion || {};

        // 1. Hero Exposure Card & Metrics
        const exposureValEl = document.getElementById("exp-exposure-val");
        const verdictPill = document.getElementById("exp-verdict-pill");
        const accuracyPctEl = document.getElementById("exp-accuracy-pct");
        const statTotalEl = document.getElementById("exp-stat-total");
        const statGapEl = document.getElementById("exp-stat-gap");
        const statMadeEl = document.getElementById("exp-stat-made");

        const taxExposure = metrics.potential_tax_exposure || 0.0;
        const missingGap = metrics.total_missing_adjustments || 0.0;
        const addbacksMade = metrics.total_add_backs_made || 0.0;
        const totalExp = metrics.total_expenses_reviewed || 0.0;
        const accuracyPct = metrics.addback_accuracy_pct !== undefined ? metrics.addback_accuracy_pct : 100.0;
        const missedCount = metrics.missed_addbacks_count || 0;
        const correctCount = metrics.correct_addbacks_count || 0;
        const allowableCount = metrics.allowable_count || 0;
        const totalCount = metrics.total_items_count || tableData.length;

        if (exposureValEl) {
            exposureValEl.textContent = totalCount > 0 ? formatCurrency(taxExposure) : "—";
        }

        if (verdictPill) {
            if (missedCount > 0) {
                verdictPill.className = "badge";
                verdictPill.style = "background: rgba(239, 68, 68, 0.18); color: #f87171; font-size: 11px; padding: 4px 10px; border-radius: 20px;";
                verdictPill.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${missedCount} Missed Add-back(s)`;
            } else if (totalCount > 0) {
                verdictPill.className = "badge";
                verdictPill.style = "background: rgba(16, 185, 129, 0.18); color: #34d399; font-size: 11px; padding: 4px 10px; border-radius: 20px;";
                verdictPill.innerHTML = '<i class="fa-solid fa-circle-check"></i> 100% Add-backs Compliant';
            } else {
                verdictPill.className = "badge";
                verdictPill.style = "background: rgba(100, 116, 139, 0.2); color: #94a3b8; font-size: 11px; padding: 4px 10px; border-radius: 20px;";
                verdictPill.textContent = "Awaiting Data Upload";
            }
        }

        if (accuracyPctEl) {
            accuracyPctEl.textContent = `${accuracyPct}%`;
            if (accuracyPct >= 90) {
                accuracyPctEl.style.color = "var(--success)";
            } else if (accuracyPct >= 50) {
                accuracyPctEl.style.color = "var(--warning)";
            } else {
                accuracyPctEl.style.color = "var(--danger)";
            }
        }

        if (statTotalEl) statTotalEl.textContent = totalCount > 0 ? formatCurrency(totalExp) : "—";
        if (statGapEl) statGapEl.textContent = totalCount > 0 ? formatCurrency(missingGap) : "—";
        if (statMadeEl) statMadeEl.textContent = totalCount > 0 ? formatCurrency(addbacksMade) : "—";

        // Counts for filter buttons
        const countAll = document.getElementById("count-exp-all");
        const countMissed = document.getElementById("count-exp-missed");
        const countCorrect = document.getElementById("count-exp-correct");
        const countAllowable = document.getElementById("count-exp-allowable");
        if (countAll) countAll.textContent = totalCount;
        if (countMissed) countMissed.textContent = missedCount;
        if (countCorrect) countCorrect.textContent = correctCount;
        if (countAllowable) countAllowable.textContent = allowableCount;

        // 2. Provisions Matrix Grid
        const provGrid = document.getElementById("exp-provisions-grid");
        if (provGrid) {
            provGrid.innerHTML = "";
            provMatrix.forEach(p => {
                const isHigh = p.risk_level === "High";
                const badgeBg = isHigh ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)";
                const badgeColor = isHigh ? "#f87171" : "#34d399";
                const card = document.createElement("div");
                card.style = `background: rgba(15, 23, 42, 0.55); border: 1px solid ${isHigh ? 'rgba(239,68,68,0.3)' : 'var(--border-color)'}; border-radius: 12px; padding: 16px; display:flex; flex-direction:column; justify-content:space-between;`;
                card.innerHTML = `
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                            <strong style="color:var(--primary); font-size:12px; letter-spacing:0.5px;">${p.section}</strong>
                            <span class="badge" style="background:${badgeBg}; color:${badgeColor}; font-size:10.5px; padding:2px 8px;">${p.risk_level}</span>
                        </div>
                        <h5 style="font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${p.title}</h5>
                        <p style="font-size:11.5px; color:var(--text-muted); line-height:1.45; margin-bottom:8px;">${p.statutory_rule}</p>
                    </div>
                    <div style="border-top:1px solid rgba(255,255,255,0.06); padding-top:8px; margin-top:4px;">
                        <div style="font-size:11.5px; color: ${isHigh ? '#f87171' : 'var(--text-muted)'}; margin-bottom:3px;"><strong>Status:</strong> ${p.disallowance_status}</div>
                        <div style="font-size:11px; color:var(--text-muted);"><strong>Tax Impact:</strong> <span style="color: ${isHigh ? 'var(--danger)' : 'var(--success)'}; font-weight:600;">${p.tax_impact}</span></div>
                    </div>
                `;
                provGrid.appendChild(card);
            });
        }

        // 3. Render 8-Column Detailed Exception Table
        renderExpenseDisallowanceTable(tableData);

        // 4. Render Step 6 CA Professional Judgement & Conclusion
        const conclusionText = document.getElementById("exp-conclusion-text");
        const checklistList = document.getElementById("exp-checklist-list");
        const correctionsList = document.getElementById("exp-corrections-list");
        const sectionsChips = document.getElementById("exp-sections-chips");

        if (conclusionText) {
            conclusionText.textContent = conclusion.overall_conclusion || "No conclusion generated. Awaiting expense audit upload.";
        }

        if (checklistList) {
            checklistList.innerHTML = "";
            const chList = conclusion.audit_checklist_findings || [];
            if (chList.length === 0) {
                checklistList.innerHTML = '<li style="color:var(--text-muted);font-style:italic;">No checklist items available.</li>';
            } else {
                chList.forEach(item => {
                    const li = document.createElement("li");
                    li.style.marginBottom = "6px";
                    li.textContent = item;
                    checklistList.appendChild(li);
                });
            }
        }

        if (correctionsList) {
            correctionsList.innerHTML = "";
            const coList = conclusion.mandatory_computation_corrections || [];
            if (coList.length === 0) {
                correctionsList.innerHTML = '<li style="color:var(--text-muted);font-style:italic;">All add-backs in order. No return adjustments required.</li>';
            } else {
                coList.forEach(item => {
                    const li = document.createElement("li");
                    li.style.marginBottom = "6px";
                    li.textContent = item;
                    correctionsList.appendChild(li);
                });
            }
        }

        if (sectionsChips) {
            sectionsChips.innerHTML = "";
            const sections = conclusion.statutory_sections_referenced || [];
            sections.forEach(sec => {
                const chip = document.createElement("span");
                chip.className = "badge";
                chip.style = "background: #1e293b; color: #cbd5e1; border: 1px solid rgba(255,255,255,0.08); padding: 5px 12px; font-size: 11.5px;";
                chip.innerHTML = `<i class="fa-solid fa-scale-balanced" style="color:var(--primary); font-size:10px; margin-right:5px;"></i> ${sec}`;
                sectionsChips.appendChild(chip);
            });
        }
    };

    // Render Table helper for filtering & search (Expense Disallowance)
    const renderExpenseDisallowanceTable = (tableData) => {
        const tableBody = document.querySelector("#table-expense-disallowance tbody");
        if (!tableBody) return;

        if (!tableData || tableData.length === 0) {
            renderEmptyStateRow(tableBody, 9);
            return;
        }

        tableBody.innerHTML = "";

        // Filter & Search
        const filtered = tableData.filter(item => {
            // Filter by category
            if (currentExpFilter === "missed" && item.status !== "Missed Add-back") return false;
            if (currentExpFilter === "correct" && item.status !== "Correct Add-back") return false;
            if (currentExpFilter === "allowable" && item.status !== "Allowable Business Expense") return false;

            // Search query
            if (currentExpSearch) {
                const q = currentExpSearch.toLowerCase();
                const matchHead = (item.expense_head || "").toLowerCase().includes(q);
                const matchSec = (item.applicable_section || "").toLowerCase().includes(q);
                const matchNat = (item.nature_of_disallowance || "").toLowerCase().includes(q);
                const matchRem = (item.remarks || "").toLowerCase().includes(q);
                return matchHead || matchSec || matchNat || matchRem;
            }
            return true;
        });

        if (filtered.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 35px; color: var(--text-muted);">
                        <i class="fa-solid fa-filter-circle-xmark" style="font-size: 24px; margin-bottom: 8px; display: block; opacity: 0.5;"></i>
                        No expense items match the current filter / search criteria.
                    </td>
                </tr>
            `;
            return;
        }

        filtered.forEach(row => {
            const tr = document.createElement("tr");
            const isMissed = row.status === "Missed Add-back";
            const isCorrect = row.status === "Correct Add-back";
            const hasDiff = (row.difference || 0) > 0;

            let badgeClass = "status-matched";
            let badgeIcon = "fa-circle-check";
            let badgeStyle = "";

            if (isMissed) {
                badgeClass = "status-discrepancy";
                badgeIcon = "fa-triangle-exclamation";
                badgeStyle = "background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3);";
            } else if (isCorrect) {
                badgeClass = "status-matched";
                badgeIcon = "fa-circle-check";
                badgeStyle = "background: rgba(16, 185, 129, 0.15); color: #34d399;";
            } else {
                badgeClass = "status-matched";
                badgeIcon = "fa-shield-halved";
                badgeStyle = "background: rgba(56, 189, 248, 0.12); color: #38bdf8;";
            }

            tr.innerHTML = `
                <td style="text-align:center; font-weight:600; color:var(--text-muted);">${row.sr_no || '—'}</td>
                <td>
                    <strong style="color:var(--text-main); display:block; font-size:12.5px;">${row.expense_head}</strong>
                    <span class="status-badge" style="font-size:10px; padding:1px 6px; margin-top:2px; ${badgeStyle}">
                        <i class="fa-solid ${badgeIcon}"></i> ${row.status}
                    </span>
                </td>
                <td style="text-align:right; font-weight:600; color:var(--text-main); font-family:monospace; font-size:12.5px;">${formatCurrency(row.amount_debited)}</td>
                <td>
                    <span class="badge" style="background:#1e293b; color:var(--primary); font-size:10.5px; padding:3px 8px; font-weight:600; display:inline-block;">${row.applicable_section}</span>
                </td>
                <td style="font-size:12px; color:var(--text-muted); line-height:1.45;">${row.nature_of_disallowance}</td>
                <td style="text-align:right; font-family:monospace; font-size:12.5px; color:${row.add_back_required > 0 ? 'var(--warning)' : 'var(--text-muted)'}; font-weight:${row.add_back_required > 0 ? '600' : 'normal'};">
                    ${row.add_back_required > 0 ? formatCurrency(row.add_back_required) : '₹0.00'}
                </td>
                <td style="text-align:right; font-family:monospace; font-size:12.5px; color:${row.add_back_made > 0 ? 'var(--success)' : 'var(--text-muted)'}; font-weight:${row.add_back_made > 0 ? '600' : 'normal'};">
                    ${row.add_back_made > 0 ? formatCurrency(row.add_back_made) : '₹0.00'}
                </td>
                <td style="text-align:right; font-family:monospace; font-size:12.5px; color:${hasDiff ? 'var(--danger)' : 'var(--text-muted)'}; font-weight:${hasDiff ? '700' : 'normal'};">
                    ${hasDiff ? `<i class="fa-solid fa-arrow-trend-up" style="font-size:10px; margin-right:3px;"></i>${formatCurrency(row.difference)}` : '₹0.00'}
                </td>
                <td style="font-size:11.5px; color: ${isMissed ? 'var(--text-main)' : 'var(--text-muted)'}; line-height:1.5; ${isMissed ? 'background:rgba(239,68,68,0.06); border-radius:4px; padding:6px;' : ''}">
                    ${row.remarks}
                </td>
            `;
            tableBody.appendChild(tr);
        });
    };

    // Filter Buttons and Search Handlers for Expense Disallowance Table
    const expFilterButtonsContainer = document.getElementById("exp-filter-buttons");
    if (expFilterButtonsContainer) {
        const eBtns = expFilterButtonsContainer.querySelectorAll("button");
        eBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                eBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                currentExpFilter = btn.getAttribute("data-filter") || "all";
                if (auditData && auditData.expense_disallowance_review) {
                    renderExpenseDisallowanceTable(auditData.expense_disallowance_review.exception_table || []);
                }
            });
        });
    }

    const searchExpInput = document.getElementById("search-exp-table");
    if (searchExpInput) {
        searchExpInput.addEventListener("input", (e) => {
            currentExpSearch = e.target.value.trim();
            if (auditData && auditData.expense_disallowance_review) {
                renderExpenseDisallowanceTable(auditData.expense_disallowance_review.exception_table || []);
            }
        });
    }

    // =========================================================================
    // Render Exempt Income Verification & Schedule EI Reconciliation
    // =========================================================================
    let currentExmFilter = "all";
    let currentExmSearch = "";

    const renderExemptIncome = () => {
        if (!auditData) return;
        const exmData = auditData.exempt_income_review || {};
        const metrics = exmData.summary_metrics || {};
        const provMatrix = exmData.provisions_matrix || [];
        const tableData = exmData.verification_table || [];
        const conclusion = exmData.final_conclusion || {};

        // 1. Hero Exposure Card & Metrics
        const mismatchValEl = document.getElementById("exm-mismatch-val");
        const riskPill = document.getElementById("exm-risk-pill");
        const eiStatusPill = document.getElementById("exm-ei-status-pill");
        const statPnlEl = document.getElementById("exm-stat-pnl");
        const statDisclosedEl = document.getElementById("exm-stat-disclosed");
        const statGapEl = document.getElementById("exm-stat-gap");

        const mismatchAmt = metrics.mismatch_amount || 0.0;
        const totalPnl = metrics.total_exempt_identified || 0.0;
        const totalDisclosed = metrics.total_exempt_disclosed || 0.0;
        const riskLevel = metrics.compliance_risk || "Low";
        const wronglyTaxedCount = metrics.wrongly_taxed_count || 0;
        const compliantCount = metrics.compliant_count || 0;
        const totalCount = metrics.total_items_count || tableData.length;

        if (mismatchValEl) {
            mismatchValEl.textContent = totalCount > 0 ? (mismatchAmt > 0 ? formatCurrency(mismatchAmt) : "₹0.00") : "—";
            mismatchValEl.style.color = mismatchAmt > 0 ? "var(--danger)" : "var(--success)";
        }

        if (riskPill) {
            if (riskLevel === "High" || wronglyTaxedCount > 0) {
                riskPill.className = "badge";
                riskPill.style = "background: rgba(239, 68, 68, 0.18); color: #f87171; font-size: 11px; padding: 4px 10px; border-radius: 20px;";
                riskPill.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> High Risk (${wronglyTaxedCount} Wrongly Taxed)`;
            } else if (riskLevel === "Medium") {
                riskPill.className = "badge";
                riskPill.style = "background: rgba(245, 158, 11, 0.18); color: #fbbf24; font-size: 11px; padding: 4px 10px; border-radius: 20px;";
                riskPill.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Medium Risk (Disclosure Gap)';
            } else if (totalCount > 0) {
                riskPill.className = "badge";
                riskPill.style = "background: rgba(16, 185, 129, 0.18); color: #34d399; font-size: 11px; padding: 4px 10px; border-radius: 20px;";
                riskPill.innerHTML = '<i class="fa-solid fa-circle-check"></i> Low Risk (100% Reconciled)';
            } else {
                riskPill.className = "badge";
                riskPill.style = "background: rgba(100, 116, 139, 0.2); color: #94a3b8; font-size: 11px; padding: 4px 10px; border-radius: 20px;";
                riskPill.textContent = "Awaiting Data Upload";
            }
        }

        if (eiStatusPill) {
            if (totalDisclosed > 0) {
                eiStatusPill.textContent = "Schedule EI Match OK";
                eiStatusPill.style.color = "var(--success)";
            } else if (totalPnl > 0) {
                eiStatusPill.textContent = "Missing Schedule EI Entry";
                eiStatusPill.style.color = "var(--warning)";
            } else {
                eiStatusPill.textContent = "NIL Exempt Income";
                eiStatusPill.style.color = "var(--text-muted)";
            }
        }

        if (statPnlEl) statPnlEl.textContent = totalCount > 0 ? formatCurrency(totalPnl) : "—";
        if (statDisclosedEl) statDisclosedEl.textContent = totalCount > 0 ? formatCurrency(totalDisclosed) : "—";
        if (statGapEl) statGapEl.textContent = totalCount > 0 ? formatCurrency(mismatchAmt) : "—";

        // Counts for filter buttons
        const countAll = document.getElementById("count-exm-all");
        const countWrong = document.getElementById("count-exm-wrong");
        const countCompliant = document.getElementById("count-exm-compliant");
        if (countAll) countAll.textContent = totalCount;
        if (countWrong) countWrong.textContent = wronglyTaxedCount;
        if (countCompliant) countCompliant.textContent = compliantCount;

        // 2. Provisions Matrix Grid
        const provGrid = document.getElementById("exm-provisions-grid");
        if (provGrid) {
            provGrid.innerHTML = "";
            provMatrix.forEach(p => {
                const isHigh = p.compliance_rating === "High Risk Exposure";
                const badgeBg = isHigh ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)";
                const badgeColor = isHigh ? "#f87171" : "#34d399";
                const card = document.createElement("div");
                card.style = `background: rgba(15, 23, 42, 0.55); border: 1px solid ${isHigh ? 'rgba(239,68,68,0.3)' : 'var(--border-color)'}; border-radius: 12px; padding: 16px; display:flex; flex-direction:column; justify-content:space-between;`;
                card.innerHTML = `
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                            <strong style="color:var(--primary); font-size:12px; letter-spacing:0.5px;">${p.section}</strong>
                            <span class="badge" style="background:${badgeBg}; color:${badgeColor}; font-size:10.5px; padding:2px 8px;">${p.compliance_rating}</span>
                        </div>
                        <h5 style="font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${p.title}</h5>
                        <p style="font-size:11.5px; color:var(--text-muted); line-height:1.45; margin-bottom:8px;">${p.statutory_rule}</p>
                    </div>
                    <div style="border-top:1px solid rgba(255,255,255,0.06); padding-top:8px; margin-top:4px;">
                        <div style="font-size:11.5px; color: ${isHigh ? '#f87171' : 'var(--text-muted)'}; margin-bottom:3px;"><strong>Verdict:</strong> ${p.audit_verdict}</div>
                        <div style="font-size:11px; color:var(--text-muted);"><strong>Action:</strong> <span style="color:var(--text-main); font-weight:500;">${p.action_required}</span></div>
                    </div>
                `;
                provGrid.appendChild(card);
            });
        }

        // 3. Render 8-Column Detailed Verification Table
        renderExemptIncomeTable(tableData);

        // 4. Render Step 5 CA Final Conclusion
        const conclusionText = document.getElementById("exm-conclusion-text");
        const checklistList = document.getElementById("exm-checklist-list");
        const correctionsList = document.getElementById("exm-corrections-list");
        const sectionsChips = document.getElementById("exm-sections-chips");
        const finalRiskBadge = document.getElementById("exm-final-risk-badge");

        if (conclusionText) {
            conclusionText.textContent = conclusion.overall_opinion || "No opinion generated. Awaiting exempt income verification upload.";
        }

        if (finalRiskBadge) {
            const isHigh = riskLevel === "High";
            finalRiskBadge.style = `background: ${isHigh ? 'rgba(239,68,68,0.18)' : 'rgba(16,185,129,0.18)'}; color: ${isHigh ? '#f87171' : '#34d399'}; font-size: 11.5px; padding: 4px 12px; border-radius: 20px;`;
            finalRiskBadge.textContent = `${riskLevel.toUpperCase()} RISK RATING`;
        }

        if (checklistList) {
            checklistList.innerHTML = "";
            const chList = conclusion.audit_checklist_findings || [];
            if (chList.length === 0) {
                checklistList.innerHTML = '<li style="color:var(--text-muted);font-style:italic;">No checklist findings recorded.</li>';
            } else {
                chList.forEach(item => {
                    const li = document.createElement("li");
                    li.style.marginBottom = "6px";
                    li.textContent = item;
                    checklistList.appendChild(li);
                });
            }
        }

        if (correctionsList) {
            correctionsList.innerHTML = "";
            const coList = conclusion.recommended_corrective_actions || [];
            if (coList.length === 0) {
                correctionsList.innerHTML = '<li style="color:var(--text-muted);font-style:italic;">All exempt incomes properly reconciled.</li>';
            } else {
                coList.forEach(item => {
                    const li = document.createElement("li");
                    li.style.marginBottom = "6px";
                    li.textContent = item;
                    correctionsList.appendChild(li);
                });
            }
        }

        if (sectionsChips) {
            sectionsChips.innerHTML = "";
            const sections = conclusion.statutory_sections_referenced || [];
            sections.forEach(sec => {
                const chip = document.createElement("span");
                chip.className = "badge";
                chip.style = "background: #1e293b; color: #cbd5e1; border: 1px solid rgba(255,255,255,0.08); padding: 5px 12px; font-size: 11.5px;";
                chip.innerHTML = `<i class="fa-solid fa-scale-balanced" style="color:var(--primary); font-size:10px; margin-right:5px;"></i> ${sec}`;
                sectionsChips.appendChild(chip);
            });
        }
    };

    // Render Table helper for filtering & search (Exempt Income)
    const renderExemptIncomeTable = (tableData) => {
        const tableBody = document.querySelector("#table-exempt-income tbody");
        if (!tableBody) return;

        if (!tableData || tableData.length === 0) {
            renderEmptyStateRow(tableBody, 9);
            return;
        }

        tableBody.innerHTML = "";

        // Filter & Search
        const filtered = tableData.filter(item => {
            if (currentExmFilter === "wrongly_taxed" && item.status !== "Wrongly Taxed (High Risk)") return false;
            if (currentExmFilter === "compliant" && item.status !== "Fully Compliant") return false;

            if (currentExmSearch) {
                const q = currentExmSearch.toLowerCase();
                const matchHead = (item.income_head_pnl || "").toLowerCase().includes(q);
                const matchSec = (item.relevant_provision || "").toLowerCase().includes(q);
                const matchNat = (item.nature_of_income || "").toLowerCase().includes(q);
                const matchRem = (item.remarks || "").toLowerCase().includes(q);
                return matchHead || matchSec || matchNat || matchRem;
            }
            return true;
        });

        if (filtered.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 35px; color: var(--text-muted);">
                        <i class="fa-solid fa-filter-circle-xmark" style="font-size: 24px; margin-bottom: 8px; display: block; opacity: 0.5;"></i>
                        No exempt income items match the current filter / search criteria.
                    </td>
                </tr>
            `;
            return;
        }

        filtered.forEach(row => {
            const tr = document.createElement("tr");
            const isWrong = row.status === "Wrongly Taxed (High Risk)";
            const isCompliant = row.status === "Fully Compliant";

            let badgeStyle = isWrong
                ? "background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3);"
                : "background: rgba(16, 185, 129, 0.15); color: #34d399;";
            let badgeIcon = isWrong ? "fa-triangle-exclamation" : "fa-circle-check";

            const shownInColPill = row.shown_in_exempt_column === "Yes"
                ? '<span class="badge" style="background:rgba(16,185,129,0.15); color:#34d399; font-size:10.5px; padding:2px 8px;"><i class="fa-solid fa-check"></i> Yes</span>'
                : '<span class="badge" style="background:rgba(239,68,68,0.15); color:#f87171; font-size:10.5px; padding:2px 8px;"><i class="fa-solid fa-xmark"></i> No</span>';

            const reducedFromTaxPill = row.reduced_from_taxable_income === "Yes"
                ? '<span class="badge" style="background:rgba(16,185,129,0.15); color:#34d399; font-size:10.5px; padding:2px 8px;"><i class="fa-solid fa-check"></i> Yes</span>'
                : '<span class="badge" style="background:rgba(239,68,68,0.15); color:#f87171; font-size:10.5px; padding:2px 8px;"><i class="fa-solid fa-xmark"></i> No</span>';

            tr.innerHTML = `
                <td style="text-align:center; font-weight:600; color:var(--text-muted);">${row.sr_no || '—'}</td>
                <td>
                    <strong style="color:var(--text-main); display:block; font-size:12.5px;">${row.income_head_pnl}</strong>
                    <span class="status-badge" style="font-size:10px; padding:1px 6px; margin-top:2px; ${badgeStyle}">
                        <i class="fa-solid ${badgeIcon}"></i> ${row.status}
                    </span>
                </td>
                <td style="text-align:right; font-weight:600; color:var(--text-main); font-family:monospace; font-size:12.5px;">${formatCurrency(row.amount_credited)}</td>
                <td style="font-size:11.5px; color:var(--text-muted); line-height:1.45;">${row.nature_of_income}</td>
                <td>
                    <span class="badge" style="background:#1e293b; color:var(--primary); font-size:10.5px; padding:3px 8px; font-weight:600; display:inline-block;">${row.relevant_provision}</span>
                </td>
                <td style="font-size:12px; color:var(--text-main);">${row.tax_treatment}</td>
                <td style="text-align:center;">${shownInColPill}</td>
                <td style="text-align:center;">${reducedFromTaxPill}</td>
                <td style="font-size:11.5px; color: ${isWrong ? 'var(--text-main)' : 'var(--text-muted)'}; line-height:1.5; ${isWrong ? 'background:rgba(239,68,68,0.06); border-radius:4px; padding:6px;' : ''}">
                    ${row.remarks}
                </td>
            `;
            tableBody.appendChild(tr);
        });
    };

    // Filter Buttons and Search Handlers for Exempt Income Table
    const exmFilterButtonsContainer = document.getElementById("exm-filter-buttons");
    if (exmFilterButtonsContainer) {
        const xBtns = exmFilterButtonsContainer.querySelectorAll("button");
        xBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                xBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                currentExmFilter = btn.getAttribute("data-filter") || "all";
                if (auditData && auditData.exempt_income_review) {
                    renderExemptIncomeTable(auditData.exempt_income_review.verification_table || []);
                }
            });
        });
    }

    const searchExmInput = document.getElementById("search-exm-table");
    if (searchExmInput) {
        searchExmInput.addEventListener("input", (e) => {
            currentExmSearch = e.target.value.trim();
            if (auditData && auditData.exempt_income_review) {
                renderExemptIncomeTable(auditData.exempt_income_review.verification_table || []);
            }
        });
    }

    // =========================================================================
    // Render Tax Regime Option & Form 10-IE / 10-IEA Verification
    // =========================================================================
    let currentRegFilter = "all";
    let currentRegSearch = "";

    const renderTaxRegime = () => {
        if (!auditData) return;
        const regData = auditData.tax_regime_review || {};
        const metrics = regData.summary_metrics || {};
        const compTax = regData.comparison_tax || {};
        const formDetails = regData.form_10iea_details || {};
        const provMatrix = regData.provisions_matrix || [];
        const tableData = regData.verification_table || [];
        const conclusion = regData.final_conclusion || {};

        // 1. Hero Exposure & Scorecard
        const selectedTitleEl = document.getElementById("reg-selected-title");
        const riskPill = document.getElementById("reg-risk-pill");
        const ieaPill = document.getElementById("reg-10iea-pill");

        const selectedRegime = regData.regime_selected || "Old Tax Regime";
        const riskLevel = metrics.compliance_risk || "Low";
        const formStatus = regData.form_10iea_status || "Form 10-IEA Validated";

        if (selectedTitleEl) selectedTitleEl.textContent = selectedRegime;

        if (riskPill) {
            if (riskLevel === "High" || (metrics.mismatch_count || 0) > 0) {
                riskPill.className = "badge";
                riskPill.style = "background: rgba(239, 68, 68, 0.18); color: #f87171; font-size: 11px; padding: 4px 10px; border-radius: 20px;";
                riskPill.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Mismatch Found';
            } else {
                riskPill.className = "badge";
                riskPill.style = "background: rgba(16, 185, 129, 0.18); color: #34d399; font-size: 11px; padding: 4px 10px; border-radius: 20px;";
                riskPill.innerHTML = '<i class="fa-solid fa-circle-check"></i> Compliant';
            }
        }

        if (ieaPill) {
            ieaPill.textContent = formStatus;
            ieaPill.style.color = formStatus.includes("Validated") || formStatus.includes("Filed") ? "var(--success)" : "var(--warning)";
        }

        // 2. Comparative Tax Calculator
        const oldTaxEl = document.getElementById("reg-old-tax-val");
        const oldIncomeEl = document.getElementById("reg-old-income-val");
        const newTaxEl = document.getElementById("reg-new-tax-val");
        const newIncomeEl = document.getElementById("reg-new-income-val");
        const savingsEl = document.getElementById("reg-savings-val");
        const optimalBadge = document.getElementById("reg-optimal-badge");

        if (oldTaxEl) oldTaxEl.textContent = formatCurrency(compTax.old_regime_tax_payable || 0.0);
        if (oldIncomeEl) oldIncomeEl.textContent = formatCurrency(compTax.old_regime_taxable_income || 0.0);
        if (newTaxEl) newTaxEl.textContent = formatCurrency(compTax.new_regime_tax_payable || 0.0);
        if (newIncomeEl) newIncomeEl.textContent = formatCurrency(compTax.new_regime_taxable_income || 0.0);
        if (savingsEl) savingsEl.textContent = formatCurrency(compTax.tax_savings_achieved || 0.0);
        if (optimalBadge) optimalBadge.textContent = compTax.optimal_regime ? `Optimal: ${compTax.optimal_regime}` : "Optimal Choice Verified";

        // 3. Form 10-IE / 10-IEA Filing Details Box
        const formNameEl = document.getElementById("reg-form-name");
        const formAckEl = document.getElementById("reg-form-ack");
        const formDateEl = document.getElementById("reg-form-date");
        const formTimelyEl = document.getElementById("reg-form-timely");

        if (formNameEl) formNameEl.textContent = formDetails.form_name || "Form 10-IEA";
        if (formAckEl) formAckEl.textContent = formDetails.ack_no || "N/A";
        if (formDateEl) formDateEl.textContent = formDetails.filing_date || "N/A";
        if (formTimelyEl) {
            const isTimely = formDetails.is_filed_on_time !== false;
            formTimelyEl.textContent = isTimely ? "Filed Before Due Date (Compliant)" : "Delayed Filing Warning";
            formTimelyEl.style.color = isTimely ? "var(--success)" : "var(--danger)";
        }

        // Counts for filter buttons
        const countAll = document.getElementById("count-reg-all");
        const countMismatch = document.getElementById("count-reg-mismatch");
        const countCompliant = document.getElementById("count-reg-compliant");
        const totalCount = metrics.total_verifications || tableData.length;
        const mismatchCount = metrics.mismatch_count || 0;
        const compliantCount = metrics.compliant_count || (totalCount - mismatchCount);

        if (countAll) countAll.textContent = totalCount;
        if (countMismatch) countMismatch.textContent = mismatchCount;
        if (countCompliant) countCompliant.textContent = compliantCount;

        // 4. Provisions Matrix Grid
        const provGrid = document.getElementById("reg-provisions-grid");
        if (provGrid) {
            provGrid.innerHTML = "";
            provMatrix.forEach(p => {
                const isCompliant = p.status === "Compliant";
                const badgeBg = isCompliant ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)";
                const badgeColor = isCompliant ? "#34d399" : "#f87171";
                const card = document.createElement("div");
                card.style = `background: rgba(15, 23, 42, 0.55); border: 1px solid ${isCompliant ? 'var(--border-color)' : 'rgba(239,68,68,0.3)'}; border-radius: 12px; padding: 16px; display:flex; flex-direction:column; justify-content:space-between;`;
                card.innerHTML = `
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                            <strong style="color:var(--primary); font-size:12px; letter-spacing:0.5px;">${p.section}</strong>
                            <span class="badge" style="background:${badgeBg}; color:${badgeColor}; font-size:10.5px; padding:2px 8px;">${p.status}</span>
                        </div>
                        <h5 style="font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${p.title}</h5>
                        <p style="font-size:11.5px; color:var(--text-muted); line-height:1.45; margin-bottom:8px;">${p.statutory_rule}</p>
                    </div>
                    <div style="border-top:1px solid rgba(255,255,255,0.06); padding-top:8px; margin-top:4px;">
                        <div style="font-size:11.5px; color:var(--text-muted); margin-bottom:3px;"><strong>Verdict:</strong> <span style="color:var(--text-main);">${p.audit_verdict}</span></div>
                        <div style="font-size:11px; color:var(--text-muted);"><strong>Action:</strong> <span style="color:var(--text-main); font-weight:500;">${p.action_required}</span></div>
                    </div>
                `;
                provGrid.appendChild(card);
            });
        }

        // 5. Render 6-Column Detailed Verification Table
        renderTaxRegimeTable(tableData);

        // 6. Render Step 6 CA Final Conclusion
        const conclusionText = document.getElementById("reg-conclusion-text");
        const checklistList = document.getElementById("reg-checklist-list");
        const correctionsList = document.getElementById("reg-corrections-list");
        const sectionsChips = document.getElementById("reg-sections-chips");
        const finalRiskBadge = document.getElementById("reg-final-risk-badge");

        if (conclusionText) {
            conclusionText.textContent = conclusion.overall_opinion || "No opinion generated. Awaiting tax regime verification upload.";
        }

        if (finalRiskBadge) {
            const isHigh = riskLevel === "High" || mismatchCount > 0;
            finalRiskBadge.style = `background: ${isHigh ? 'rgba(239,68,68,0.18)' : 'rgba(16,185,129,0.18)'}; color: ${isHigh ? '#f87171' : '#34d399'}; font-size: 11.5px; padding: 4px 12px; border-radius: 20px;`;
            finalRiskBadge.textContent = `${riskLevel.toUpperCase()} RISK RATING`;
        }

        if (checklistList) {
            checklistList.innerHTML = "";
            const chList = conclusion.audit_checklist_findings || [];
            if (chList.length === 0) {
                checklistList.innerHTML = '<li style="color:var(--text-muted);font-style:italic;">No checklist findings recorded.</li>';
            } else {
                chList.forEach(item => {
                    const li = document.createElement("li");
                    li.style.marginBottom = "6px";
                    li.textContent = item;
                    checklistList.appendChild(li);
                });
            }
        }

        if (correctionsList) {
            correctionsList.innerHTML = "";
            const coList = conclusion.recommended_corrective_actions || [];
            if (coList.length === 0) {
                correctionsList.innerHTML = '<li style="color:var(--text-muted);font-style:italic;">Tax regime selection fully validated and optimized.</li>';
            } else {
                coList.forEach(item => {
                    const li = document.createElement("li");
                    li.style.marginBottom = "6px";
                    li.textContent = item;
                    correctionsList.appendChild(li);
                });
            }
        }

        if (sectionsChips) {
            sectionsChips.innerHTML = "";
            const sections = conclusion.statutory_sections_referenced || [];
            sections.forEach(sec => {
                const chip = document.createElement("span");
                chip.className = "badge";
                chip.style = "background: #1e293b; color: #cbd5e1; border: 1px solid rgba(255,255,255,0.08); padding: 5px 12px; font-size: 11.5px;";
                chip.innerHTML = `<i class="fa-solid fa-scale-balanced" style="color:var(--primary); font-size:10px; margin-right:5px;"></i> ${sec}`;
                sectionsChips.appendChild(chip);
            });
        }
    };

    // Render Table helper for filtering & search (Tax Regime)
    const renderTaxRegimeTable = (tableData) => {
        const tableBody = document.querySelector("#table-tax-regime tbody");
        if (!tableBody) return;

        if (!tableData || tableData.length === 0) {
            renderEmptyStateRow(tableBody, 6);
            return;
        }

        tableBody.innerHTML = "";

        // Filter & Search
        const filtered = tableData.filter(item => {
            const isCompliant = item.compliance_status === "Fully Compliant";
            if (currentRegFilter === "mismatch" && isCompliant) return false;
            if (currentRegFilter === "compliant" && !isCompliant) return false;

            if (currentRegSearch) {
                const q = currentRegSearch.toLowerCase();
                const matchParam = (item.parameter || "").toLowerCase().includes(q);
                const matchSrc = (item.source_data || "").toLowerCase().includes(q);
                const matchReg = (item.selected_regime || "").toLowerCase().includes(q);
                const matchAudit = (item.audit_findings || "").toLowerCase().includes(q);
                return matchParam || matchSrc || matchReg || matchAudit;
            }
            return true;
        });

        if (filtered.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 35px; color: var(--text-muted);">
                        <i class="fa-solid fa-filter-circle-xmark" style="font-size: 24px; margin-bottom: 8px; display: block; opacity: 0.5;"></i>
                        No regime verification parameters match the current filter / search criteria.
                    </td>
                </tr>
            `;
            return;
        }

        filtered.forEach(row => {
            const tr = document.createElement("tr");
            const isCompliant = row.compliance_status === "Fully Compliant";

            let badgeStyle = isCompliant
                ? "background: rgba(16, 185, 129, 0.15); color: #34d399;"
                : "background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3);";
            let badgeIcon = isCompliant ? "fa-circle-check" : "fa-triangle-exclamation";

            tr.innerHTML = `
                <td style="text-align:center; font-weight:600; color:var(--text-muted);">${row.sr_no || '—'}</td>
                <td>
                    <strong style="color:var(--text-main); display:block; font-size:12.5px;">${row.parameter}</strong>
                </td>
                <td style="font-size:12px; color:var(--text-main); font-family:monospace;">${row.source_data}</td>
                <td>
                    <span class="badge" style="background:#1e293b; color:var(--primary); font-size:11px; padding:3px 8px; font-weight:600; display:inline-block;">${row.selected_regime}</span>
                </td>
                <td style="text-align:center;">
                    <span class="status-badge" style="font-size:10.5px; padding:3px 8px; ${badgeStyle}">
                        <i class="fa-solid ${badgeIcon}"></i> ${row.compliance_status}
                    </span>
                </td>
                <td style="font-size:11.5px; color:var(--text-muted); line-height:1.5;">
                    ${row.audit_findings}
                </td>
            `;
            tableBody.appendChild(tr);
        });
    };

    // Filter Buttons and Search Handlers for Tax Regime Table
    const regFilterButtonsContainer = document.getElementById("reg-filter-buttons");
    if (regFilterButtonsContainer) {
        const rBtns = regFilterButtonsContainer.querySelectorAll("button");
        rBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                rBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                currentRegFilter = btn.getAttribute("data-filter") || "all";
                if (auditData && auditData.tax_regime_review) {
                    renderTaxRegimeTable(auditData.tax_regime_review.verification_table || []);
                }
            });
        });
    }

    const searchRegInput = document.getElementById("search-reg-table");
    if (searchRegInput) {
        searchRegInput.addEventListener("input", (e) => {
            currentRegSearch = e.target.value.trim();
            if (auditData && auditData.tax_regime_review) {
                renderTaxRegimeTable(auditData.tax_regime_review.verification_table || []);
            }
        });
    }

    // =========================================================================
    // Render Independent Tax Liability Recalculation & Statutory Computation
    // =========================================================================
    const renderTaxComputation = () => {
        if (!auditData) return;
        const tcData = auditData.tax_computation_review || {};
        const secA = tcData.section_a_regime || [];
        const secB = tcData.section_b_deductions || [];
        const secC = tcData.section_c_computation || [];
        const secD = tcData.section_d_credits || [];
        const secE = tcData.section_e_exceptions || [];
        const matrix = tcData.final_summary_matrix || [];
        const conclusion = tcData.final_conclusion || {};

        // Hero Cards & Status
        const statusPill = document.getElementById("tc-status-pill");
        const netPosVal = document.getElementById("tc-net-position-val");
        const taxGapVal = document.getElementById("tc-tax-gap-val");

        const overallStatus = tcData.overall_status || "Requires Correction";
        const isRequiresCorrection = overallStatus.includes("Correction") || overallStatus.includes("Error");

        if (statusPill) {
            statusPill.className = "badge";
            statusPill.style = `background: ${isRequiresCorrection ? 'rgba(239, 68, 68, 0.18)' : 'rgba(16, 185, 129, 0.18)'}; color: ${isRequiresCorrection ? '#f87171' : '#34d399'}; font-size: 11px; padding: 4px 10px; border-radius: 20px;`;
            statusPill.textContent = overallStatus;
        }

        // Net position row 8 of Section D
        const netRow = secD.find(r => r.particulars.includes("Net Tax Payable"));
        if (netPosVal && netRow) {
            const val = netRow.as_per_verification || 0.0;
            netPosVal.textContent = val > 0 ? `Tax Payable: ${formatCurrency(val)}` : (val < 0 ? `Refund: ${formatCurrency(Math.abs(val))}` : "₹0.00 (NIL)");
            netPosVal.style.color = val > 0 ? "var(--danger)" : "var(--success)";
        }

        // Gross tax liability diff row 15 of Section C
        const grossRow = secC.find(r => r.sr_no === 15);
        if (taxGapVal && grossRow) {
            const diff = Math.abs(grossRow.difference || 0.0);
            taxGapVal.textContent = diff > 0 ? `₹${formatCurrency(diff)} Understated` : "₹0.00 (Reconciled)";
            taxGapVal.style.color = diff > 0 ? "var(--danger)" : "var(--success)";
        }

        // Render Sub-tables
        renderTcSummaryMatrix(matrix);
        renderTcSectionA(secA);
        renderTcSectionB(secB);
        renderTcSectionC(secC);
        renderTcSectionD(secD);
        renderTcSectionE(secE);

        // Render Step 6 Final Conclusion
        const conclusionText = document.getElementById("tc-conclusion-text");
        const checklistList = document.getElementById("tc-checklist-list");
        const correctionsList = document.getElementById("tc-corrections-list");
        const sectionsChips = document.getElementById("tc-sections-chips");
        const finalStatusBadge = document.getElementById("tc-final-status-badge");

        if (conclusionText) conclusionText.textContent = conclusion.overall_opinion || "No opinion generated.";

        if (finalStatusBadge) {
            finalStatusBadge.style = `background: ${isRequiresCorrection ? 'rgba(239, 68, 68, 0.18)' : 'rgba(16, 185, 129, 0.18)'}; color: ${isRequiresCorrection ? '#f87171' : '#34d399'}; font-size: 11.5px; padding: 4px 12px; border-radius: 20px;`;
            finalStatusBadge.textContent = overallStatus.toUpperCase();
        }

        if (checklistList) {
            checklistList.innerHTML = "";
            (conclusion.audit_checklist_findings || []).forEach(item => {
                const li = document.createElement("li");
                li.style.marginBottom = "6px";
                li.textContent = item;
                checklistList.appendChild(li);
            });
        }

        if (correctionsList) {
            correctionsList.innerHTML = "";
            (conclusion.recommended_corrective_actions || []).forEach(item => {
                const li = document.createElement("li");
                li.style.marginBottom = "6px";
                li.textContent = item;
                correctionsList.appendChild(li);
            });
        }

        if (sectionsChips) {
            sectionsChips.innerHTML = "";
            (conclusion.statutory_sections_referenced || []).forEach(sec => {
                const chip = document.createElement("span");
                chip.className = "badge";
                chip.style = "background: #1e293b; color: #cbd5e1; border: 1px solid rgba(255,255,255,0.08); padding: 5px 12px; font-size: 11.5px;";
                chip.innerHTML = `<i class="fa-solid fa-scale-balanced" style="color:var(--primary); font-size:10px; margin-right:5px;"></i> ${sec}`;
                sectionsChips.appendChild(chip);
            });
        }
    };

    // Sub-table renderers for Tax Computation
    const renderTcSummaryMatrix = (matrix) => {
        const grid = document.getElementById("tc-summary-matrix-grid");
        if (!grid) return;
        grid.innerHTML = "";
        matrix.forEach(m => {
            const isOk = m.status.includes("Correct") || m.status.includes("Complied") || m.status.includes("Verified");
            const isWarn = m.status.includes("Add-back") || m.status.includes("Applicable");
            const bg = isOk ? "rgba(16,185,129,0.12)" : (isWarn ? "rgba(245,158,11,0.12)" : "rgba(239,68,68,0.12)");
            const color = isOk ? "#34d399" : (isWarn ? "#fbbf24" : "#f87171");
            const div = document.createElement("div");
            div.style = `background:rgba(15,23,42,0.6); border:1px solid var(--border-color); border-radius:10px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;`;
            div.innerHTML = `
                <span style="font-size:11.5px; color:var(--text-muted); font-weight:600;">${m.parameter}</span>
                <span class="badge" style="background:${bg}; color:${color}; font-size:10.5px; padding:2px 8px;">${m.status}</span>
            `;
            grid.appendChild(div);
        });
    };

    const renderTcSectionA = (rows) => {
        const tbody = document.querySelector("#table-tc-section-a tbody");
        if (!tbody) return;
        tbody.innerHTML = "";
        rows.forEach(r => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong style="color:var(--text-main); font-size:12.5px;">${r.particulars}</strong></td>
                <td style="font-size:12px; color:var(--text-main); font-family:monospace;">${r.as_per_computation}</td>
                <td style="font-size:12px; color:var(--primary); font-family:monospace;">${r.as_per_verification}</td>
                <td style="text-align:center;">
                    <span class="badge" style="background:rgba(16,185,129,0.15); color:#34d399; font-size:10.5px; padding:2px 8px;"><i class="fa-solid fa-check"></i> ${r.status}</span>
                </td>
                <td style="font-size:11.5px; color:var(--text-muted);">${r.remarks}</td>
            `;
            tbody.appendChild(tr);
        });
    };

    const renderTcSectionB = (rows) => {
        const tbody = document.querySelector("#table-tc-section-b tbody");
        if (!tbody) return;
        tbody.innerHTML = "";
        rows.forEach(r => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong style="color:var(--text-main); font-size:12.5px;">${r.particulars}</strong></td>
                <td style="text-align:right; font-weight:600; font-family:monospace; font-size:12.5px;">${formatCurrency(r.claimed_in_computation)}</td>
                <td style="text-align:right; font-weight:600; font-family:monospace; font-size:12.5px; color:var(--primary);">${formatCurrency(r.eligible_as_per_law)}</td>
                <td style="text-align:right; font-weight:600; font-family:monospace; font-size:12.5px; color:${r.difference !== 0 ? 'var(--danger)' : 'var(--text-muted)'};">${formatCurrency(r.difference)}</td>
                <td style="font-size:11.5px; color:var(--text-muted);">${r.remarks}</td>
            `;
            tbody.appendChild(tr);
        });
    };

    const renderTcSectionC = (rows) => {
        const tbody = document.querySelector("#table-tc-section-c tbody");
        if (!tbody) return;
        tbody.innerHTML = "";
        rows.forEach(r => {
            const tr = document.createElement("tr");
            const isMismatch = r.status === "Mismatch";
            if (isMismatch) tr.style.background = "rgba(239, 68, 68, 0.04)";

            const compVal = typeof r.as_per_computation === 'number' ? formatCurrency(r.as_per_computation) : r.as_per_computation;
            const verVal = typeof r.as_per_verification === 'number' ? formatCurrency(r.as_per_verification) : r.as_per_verification;
            const diffVal = typeof r.difference === 'number' ? formatCurrency(r.difference) : r.difference;

            const badgeStyle = isMismatch
                ? "background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3);"
                : "background: rgba(16, 185, 129, 0.15); color: #34d399;";

            tr.innerHTML = `
                <td style="text-align:center; font-weight:600; color:var(--text-muted);">${r.sr_no}</td>
                <td><strong style="color:var(--text-main); font-size:12.5px;">${r.particulars}</strong></td>
                <td style="text-align:right; font-weight:600; font-family:monospace; font-size:12.5px;">${compVal}</td>
                <td style="text-align:right; font-weight:700; font-family:monospace; font-size:12.5px; color:var(--primary);">${verVal}</td>
                <td style="text-align:right; font-weight:600; font-family:monospace; font-size:12.5px; color:${isMismatch ? 'var(--danger)' : 'var(--text-muted)'};">${diffVal}</td>
                <td style="text-align:center;">
                    <span class="status-badge" style="font-size:10.5px; padding:2px 8px; ${badgeStyle}">${r.status}</span>
                </td>
                <td style="font-size:11.5px; color:${isMismatch ? 'var(--text-main)' : 'var(--text-muted)'}; line-height:1.45;">${r.remarks}</td>
            `;
            tbody.appendChild(tr);
        });
    };

    const renderTcSectionD = (rows) => {
        const tbody = document.querySelector("#table-tc-section-d tbody");
        if (!tbody) return;
        tbody.innerHTML = "";
        rows.forEach(r => {
            const tr = document.createElement("tr");
            const hasDiff = r.difference !== 0;
            if (hasDiff) tr.style.background = "rgba(239, 68, 68, 0.04)";
            tr.innerHTML = `
                <td><strong style="color:var(--text-main); font-size:12.5px;">${r.particulars}</strong></td>
                <td style="text-align:right; font-weight:600; font-family:monospace; font-size:12.5px;">${formatCurrency(r.as_per_computation)}</td>
                <td style="text-align:right; font-weight:700; font-family:monospace; font-size:12.5px; color:var(--primary);">${formatCurrency(r.as_per_verification)}</td>
                <td style="text-align:right; font-weight:600; font-family:monospace; font-size:12.5px; color:${hasDiff ? 'var(--danger)' : 'var(--text-muted)'};">${formatCurrency(r.difference)}</td>
                <td style="font-size:11.5px; color:var(--text-muted);">${r.remarks}</td>
            `;
            tbody.appendChild(tr);
        });
    };

    const renderTcSectionE = (rows) => {
        const tbody = document.querySelector("#table-tc-section-e tbody");
        if (!tbody) return;
        tbody.innerHTML = "";
        rows.forEach(r => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="text-align:center; font-weight:600; color:var(--text-muted);">${r.sr_no}</td>
                <td><strong style="color:var(--warning); font-size:12.5px;">${r.area}</strong></td>
                <td style="font-size:12px; color:var(--text-main); line-height:1.45;">${r.issue_identified}</td>
                <td style="text-align:right; font-weight:700; font-family:monospace; font-size:12.5px; color:var(--danger);">${formatCurrency(r.tax_impact)}</td>
                <td><span class="badge" style="background:#1e293b; color:var(--primary); font-size:10.5px; padding:3px 8px; font-weight:600;">${r.relevant_section}</span></td>
                <td style="font-size:11.5px; color:var(--text-main); font-weight:500;">${r.recommended_action}</td>
            `;
            tbody.appendChild(tr);
        });
    };

    // =========================================================================
    // Render Form 26AS TDS Credit & Corresponding Income Reconciliation (Sec 199 & Rule 37BA)
    // =========================================================================
    let currentTdsFilter = "all";
    let currentTdsSearch = "";

    const renderTds26asReconciliation = () => {
        if (!auditData) return;
        const tdsData = auditData.tds_26as_reconciliation || {};
        const masterTable = tdsData.master_table || [];
        const tdsSummary = tdsData.tds_control_summary || {};
        const incSummary = tdsData.income_control_summary || {};
        const sectionBreakdown = tdsData.section_breakdown || [];
        const riskAlerts = tdsData.risk_alerts || [];
        const conclusion = tdsData.final_conclusion || {};

        // Hero Status & Value Cards
        const statusPill = document.getElementById("tds-status-pill");
        const matchStatusVal = document.getElementById("tds-match-status-val");
        const unreflectedVal = document.getElementById("tds-unreflected-val");

        const overallStatus = tdsData.overall_status || "Fully Reconciled";
        const isOk = overallStatus.includes("Fully") || overallStatus.includes("Reconciled");

        if (statusPill) {
            statusPill.className = "badge";
            statusPill.style = `background: ${isOk ? 'rgba(16, 185, 129, 0.18)' : 'rgba(239, 68, 68, 0.18)'}; color: ${isOk ? '#34d399' : '#f87171'}; font-size: 11px; padding: 4px 10px; border-radius: 20px;`;
            statusPill.textContent = overallStatus;
        }

        if (matchStatusVal) {
            matchStatusVal.textContent = tdsData.overall_match_status || "100% Verified";
        }

        if (unreflectedVal) {
            const excessOrUnreflected = tdsSummary.excess_tds_claimed || 0.0;
            unreflectedVal.textContent = excessOrUnreflected > 0 ? `₹${formatCurrency(excessOrUnreflected)} Unreflected / Excess` : "₹0.00 (Fully Matched)";
            unreflectedVal.style.color = excessOrUnreflected > 0 ? "#f87171" : "#34d399";
        }

        // Final Control Summary Cards
        const sumTds26as = document.getElementById("sum-tds-26as");
        const sumTdsClaimed = document.getElementById("sum-tds-claimed");
        const sumTdsUnclaimed = document.getElementById("sum-tds-unclaimed");
        const sumTdsExcess = document.getElementById("sum-tds-excess");

        if (sumTds26as) sumTds26as.textContent = formatCurrency(tdsSummary.total_tds_26as);
        if (sumTdsClaimed) sumTdsClaimed.textContent = formatCurrency(tdsSummary.tds_claimed_itr);
        if (sumTdsUnclaimed) sumTdsUnclaimed.textContent = formatCurrency(tdsSummary.tds_not_claimed);
        if (sumTdsExcess) sumTdsExcess.textContent = formatCurrency(tdsSummary.excess_tds_claimed);

        const sumInc26as = document.getElementById("sum-inc-26as");
        const sumIncOffered = document.getElementById("sum-inc-offered");
        const sumIncExplained = document.getElementById("sum-inc-explained");
        const sumIncUnexplained = document.getElementById("sum-inc-unexplained");

        if (sumInc26as) sumInc26as.textContent = formatCurrency(incSummary.gross_receipts_26as);
        if (sumIncOffered) sumIncOffered.textContent = formatCurrency(incSummary.corresponding_income_identified);
        if (sumIncExplained) sumIncExplained.textContent = formatCurrency(incSummary.explained_differences);
        if (sumIncUnexplained) sumIncUnexplained.textContent = formatCurrency(incSummary.unexplained_differences);

        // Render Tables & Alerts
        renderTdsMasterTable(masterTable);
        renderTdsSectionBreakdown(sectionBreakdown);
        renderTdsRiskAlerts(riskAlerts);

        // Render Step 6 Final Conclusion Panel
        const conclusionText = document.getElementById("tds-conclusion-text");
        const checklistList = document.getElementById("tds-checklist-list");
        const correctionsList = document.getElementById("tds-corrections-list");
        const sectionsChips = document.getElementById("tds-sections-chips");
        const finalStatusBadge = document.getElementById("tds-final-status-badge");

        if (conclusionText) conclusionText.textContent = conclusion.overall_opinion || "No opinion generated.";

        if (finalStatusBadge) {
            finalStatusBadge.style = `background: ${isOk ? 'rgba(16, 185, 129, 0.18)' : 'rgba(239, 68, 68, 0.18)'}; color: ${isOk ? '#34d399' : '#f87171'}; font-size: 11.5px; padding: 4px 12px; border-radius: 20px;`;
            finalStatusBadge.textContent = overallStatus.toUpperCase();
        }

        if (checklistList) {
            checklistList.innerHTML = "";
            (conclusion.audit_checklist_findings || []).forEach(item => {
                const li = document.createElement("li");
                li.style.marginBottom = "6px";
                li.textContent = item;
                checklistList.appendChild(li);
            });
        }

        if (correctionsList) {
            correctionsList.innerHTML = "";
            (conclusion.recommended_corrective_actions || []).forEach(item => {
                const li = document.createElement("li");
                li.style.marginBottom = "6px";
                li.textContent = item;
                correctionsList.appendChild(li);
            });
        }

        if (sectionsChips) {
            sectionsChips.innerHTML = "";
            (conclusion.statutory_sections_referenced || []).forEach(sec => {
                const chip = document.createElement("span");
                chip.className = "badge";
                chip.style = "background: #1e293b; color: #cbd5e1; border: 1px solid rgba(255,255,255,0.08); padding: 5px 12px; font-size: 11.5px;";
                chip.innerHTML = `<i class="fa-solid fa-scale-balanced" style="color:var(--primary); font-size:10px; margin-right:5px;"></i> ${sec}`;
                sectionsChips.appendChild(chip);
            });
        }
    };

    // Sub-renderers for 26AS TDS Check
    const renderTdsMasterTable = (rows) => {
        const tbody = document.querySelector("#table-tds-26as-master tbody");
        if (!tbody) return;
        tbody.innerHTML = "";

        const filtered = rows.filter(r => {
            if (currentTdsFilter === "reconciled" && !r.status.includes("Fully")) return false;
            if (currentTdsFilter === "explained" && !r.status.includes("Reconciled –")) return false;
            if (currentTdsFilter === "highrisk" && (r.risk_level !== "High Risk" && !r.status.includes("Mismatch") && !r.status.includes("🔴"))) return false;

            if (currentTdsSearch) {
                const q = currentTdsSearch.toLowerCase();
                const matchName = (r.deductor || "").toLowerCase().includes(q);
                const matchTan = (r.tan || "").toLowerCase().includes(q);
                const matchSec = (r.tds_section || "").toLowerCase().includes(q);
                const matchInc = (r.corresponding_income || "").toLowerCase().includes(q);
                const matchHead = (r.head_of_income || "").toLowerCase().includes(q);
                if (!matchName && !matchTan && !matchSec && !matchInc && !matchHead) return false;
            }
            return true;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="14" style="text-align:center; padding:24px; color:var(--text-muted);">No 26AS TDS reconciliation entries match the selected filter.</td></tr>`;
            return;
        }

        filtered.forEach(r => {
            const tr = document.createElement("tr");
            const isHighRisk = r.risk_level === "High Risk" || r.status.includes("🔴");
            if (isHighRisk) tr.style.background = "rgba(239, 68, 68, 0.04)";

            const statusBg = r.status.includes("Fully")
                ? "rgba(16, 185, 129, 0.15); color: #34d399;"
                : (r.status.includes("Reconciled –") ? "rgba(245, 158, 11, 0.15); color: #fbbf24;" : "rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3);");

            const riskBg = r.risk_level === "High Risk"
                ? "background: rgba(239,68,68,0.18); color: #f87171;"
                : (r.risk_level === "Medium Risk" ? "background: rgba(245,158,11,0.18); color: #fbbf24;" : "background: rgba(16,185,129,0.18); color: #34d399;");

            tr.innerHTML = `
                <td style="text-align:center; font-weight:600; color:var(--text-muted);">${r.sr_no}</td>
                <td><strong style="color:var(--text-main); font-size:12.5px;">${r.deductor}</strong></td>
                <td><code style="color:var(--primary); font-size:11.5px;">${r.tan}</code></td>
                <td><span class="badge" style="background:#1e293b; color:var(--text-main); font-size:11px;">${r.tds_section}</span></td>
                <td style="text-align:right; font-family:monospace; font-size:12px;">${formatCurrency(r.gross_26as)}</td>
                <td style="text-align:right; font-family:monospace; font-size:12px;">${formatCurrency(r.tds_26as)}</td>
                <td style="text-align:right; font-family:monospace; font-size:12px; font-weight:700; color:var(--primary);">${formatCurrency(r.tds_claimed_itr)}</td>
                <td style="font-size:12px; color:var(--text-main);">${r.corresponding_income}</td>
                <td style="text-align:right; font-family:monospace; font-size:12px; color:var(--success); font-weight:600;">${formatCurrency(r.amount_offered)}</td>
                <td style="font-size:11.5px; color:var(--text-muted);">${r.head_of_income}</td>
                <td style="text-align:right; font-family:monospace; font-size:12px; color:${r.difference !== 0 ? 'var(--danger)' : 'var(--text-muted)'};">${formatCurrency(r.difference)}</td>
                <td style="text-align:center;">
                    <span class="status-badge" style="font-size:10.5px; padding:3px 8px; ${statusBg}">${r.status}</span>
                </td>
                <td style="text-align:center;">
                    <span class="badge" style="font-size:10px; padding:2px 6px; ${riskBg}">${r.risk_level}</span>
                </td>
                <td style="font-size:11.5px; color:var(--text-main); line-height:1.45;">${r.remarks}</td>
            `;
            tbody.appendChild(tr);
        });
    };

    const renderTdsSectionBreakdown = (rows) => {
        const tbody = document.querySelector("#table-tds-sections-breakdown tbody");
        if (!tbody) return;
        tbody.innerHTML = "";
        rows.forEach(r => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong style="color:var(--text-main); font-size:12px;">${r.section}</strong></td>
                <td style="text-align:right; font-family:monospace; font-size:12px;">${formatCurrency(r['26as_gross'])}</td>
                <td style="text-align:right; font-family:monospace; font-size:12px;">${formatCurrency(r['26as_tds'])}</td>
                <td style="text-align:right; font-family:monospace; font-size:12px; color:var(--primary); font-weight:600;">${formatCurrency(r.claimed_tds)}</td>
                <td style="text-align:center;">
                    <span class="badge" style="background:#1e293b; color:var(--primary); font-size:10.5px; padding:2px 8px;">${r.status}</span>
                </td>
            `;
            tbody.appendChild(tr);
        });
    };

    const renderTdsRiskAlerts = (alerts) => {
        const container = document.getElementById("tds-risk-alerts-container");
        if (!container) return;
        container.innerHTML = "";
        alerts.forEach(a => {
            const isHigh = a.severity.includes("HIGH");
            const div = document.createElement("div");
            div.style = `background: ${isHigh ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)'}; border: 1px solid ${isHigh ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}; border-radius: 10px; padding: 12px 14px;`;
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="font-size:12px; font-weight:700; color:${isHigh ? '#f87171' : '#fbbf24'};"><i class="fa-solid fa-triangle-exclamation" style="margin-right:4px;"></i> ${a.title}</span>
                    <span class="badge" style="background:${isHigh ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}; color:${isHigh ? '#f87171' : '#fbbf24'}; font-size:10px;">${a.severity}</span>
                </div>
                <p style="font-size:12px; color:var(--text-main); margin:0 0 8px 0; line-height:1.45;">${a.message}</p>
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--text-muted);">
                    <span>Relevant Section: <code style="color:var(--primary);">${a.relevant_section}</code></span>
                    <span>Tax Impact: <strong style="color:${isHigh ? '#f87171' : '#fbbf24'}; font-family:monospace;">${formatCurrency(a.tax_impact)}</strong></span>
                </div>
            `;
            container.appendChild(div);
        });
    };

    // Filter Buttons & Search Listeners
    const filterContainer = document.getElementById("tds-filter-buttons");
    if (filterContainer) {
        filterContainer.addEventListener("click", (e) => {
            const btn = e.target.closest("button");
            if (!btn) return;
            filterContainer.querySelectorAll("button").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentTdsFilter = btn.getAttribute("data-filter") || "all";
            if (auditData && auditData.tds_26as_reconciliation) {
                renderTdsMasterTable(auditData.tds_26as_reconciliation.master_table || []);
            }
        });
    }

    const searchTdsInput = document.getElementById("search-tds-table");
    if (searchTdsInput) {
        searchTdsInput.addEventListener("input", (e) => {
            currentTdsSearch = e.target.value.trim();
            if (auditData && auditData.tds_26as_reconciliation) {
                renderTdsMasterTable(auditData.tds_26as_reconciliation.master_table || []);
            }
        });
    }

    // =========================================================================
    // Render TDS Carry Forward & Rule 37BA Timing Verification
    // =========================================================================
    let currentTdsCfFilter = "all";
    let currentTdsCfSearch = "";

    const renderTdsCarryForward = () => {
        if (!auditData) return;
        const cfData = auditData.tds_carry_forward_review || {};
        const masterTable = cfData.master_table || [];
        const controlSummary = cfData.control_summary || {};
        const cySummary = controlSummary.current_year || {};
        const bfSummary = controlSummary.brought_forward || {};
        const posSummary = controlSummary.closing_position || {};
        const cfRegister = cfData.carry_forward_register || [];
        const riskAlerts = cfData.risk_alerts || [];
        const conclusion = cfData.final_conclusion || {};

        // Hero Status & Cards
        const statusPill = document.getElementById("cf-status-pill");
        const complianceStatusVal = document.getElementById("cf-compliance-status-val");
        const closingBalVal = document.getElementById("cf-closing-balance-val");

        const overallStatus = cfData.overall_status || "Fully Reconciled & Compliant";
        const isOk = overallStatus.includes("Fully") || overallStatus.includes("Compliant");

        if (statusPill) {
            statusPill.className = "badge";
            statusPill.style = `background: ${isOk ? 'rgba(16, 185, 129, 0.18)' : 'rgba(239, 68, 68, 0.18)'}; color: ${isOk ? '#34d399' : '#f87171'}; font-size: 11px; padding: 4px 10px; border-radius: 20px;`;
            statusPill.textContent = overallStatus;
        }

        if (complianceStatusVal) {
            complianceStatusVal.textContent = cfData.overall_compliance_status || "100% Compliant";
        }

        if (closingBalVal) {
            const closingAmt = posSummary.closing_tds_cf || 0.0;
            closingBalVal.textContent = `₹${formatCurrency(closingAmt)}`;
            closingBalVal.style.color = closingAmt > 0 ? "var(--primary)" : "var(--success)";
        }

        // Control Summary Metric Blocks
        // Block 1: Current-Year TDS
        const sumCy26as = document.getElementById("sum-cf-cy-26as");
        const sumCyEligible = document.getElementById("sum-cf-cy-eligible");
        const sumCyClaimed = document.getElementById("sum-cf-cy-claimed");
        const sumCyCf = document.getElementById("sum-cf-cy-cf");

        if (sumCy26as) sumCy26as.textContent = formatCurrency(cySummary.total_tds_26as);
        if (sumCyEligible) sumCyEligible.textContent = formatCurrency(cySummary.tds_eligible_cy);
        if (sumCyClaimed) sumCyClaimed.textContent = formatCurrency(cySummary.tds_claimed);
        if (sumCyCf) sumCyCf.textContent = formatCurrency(cySummary.tds_to_carry_forward);

        // Block 2: Brought-Forward TDS
        const sumBfOpening = document.getElementById("sum-cf-bf-opening");
        const sumBfEligible = document.getElementById("sum-cf-bf-eligible");
        const sumBfClaimed = document.getElementById("sum-cf-bf-claimed");
        const sumBfBal = document.getElementById("sum-cf-bf-bal");

        if (sumBfOpening) sumBfOpening.textContent = formatCurrency(bfSummary.opening_unclaimed_tds_bf);
        if (sumBfEligible) sumBfEligible.textContent = formatCurrency(bfSummary.tds_becoming_eligible_cy);
        if (sumBfClaimed) sumBfClaimed.textContent = formatCurrency(bfSummary.bf_tds_claimed_cy);
        if (sumBfBal) sumBfBal.textContent = formatCurrency(bfSummary.balance_bf_tds);

        // Block 3: Closing Position
        const sumPosOpening = document.getElementById("sum-cf-pos-opening");
        const sumPosCy = document.getElementById("sum-cf-pos-cy");
        const sumPosClaimed = document.getElementById("sum-cf-pos-claimed");
        const sumPosClosing = document.getElementById("sum-cf-pos-closing");

        if (sumPosOpening) sumPosOpening.textContent = formatCurrency(posSummary.opening_tds_cf);
        if (sumPosCy) sumPosCy.textContent = formatCurrency(posSummary.cy_tds_cf);
        if (sumPosClaimed) sumPosClaimed.textContent = formatCurrency(posSummary.bf_tds_claimed);
        if (sumPosClosing) sumPosClosing.textContent = formatCurrency(posSummary.closing_tds_cf);

        // Render Tables & Alerts
        renderTdsCfMasterTable(masterTable);
        renderTdsCfRegister(cfRegister);
        renderTdsCfRiskAlerts(riskAlerts);

        // Render Step 6 Final Conclusion Panel
        const conclusionText = document.getElementById("cf-conclusion-text");
        const checklistList = document.getElementById("cf-checklist-list");
        const correctionsList = document.getElementById("cf-corrections-list");
        const sectionsChips = document.getElementById("cf-sections-chips");
        const finalStatusBadge = document.getElementById("cf-final-status-badge");

        if (conclusionText) conclusionText.textContent = conclusion.overall_opinion || "No opinion generated.";

        if (finalStatusBadge) {
            finalStatusBadge.style = `background: ${isOk ? 'rgba(16, 185, 129, 0.18)' : 'rgba(239, 68, 68, 0.18)'}; color: ${isOk ? '#34d399' : '#f87171'}; font-size: 11.5px; padding: 4px 12px; border-radius: 20px;`;
            finalStatusBadge.textContent = overallStatus.toUpperCase();
        }

        if (checklistList) {
            checklistList.innerHTML = "";
            (conclusion.audit_checklist_findings || []).forEach(item => {
                const li = document.createElement("li");
                li.style.marginBottom = "6px";
                li.textContent = item;
                checklistList.appendChild(li);
            });
        }

        if (correctionsList) {
            correctionsList.innerHTML = "";
            (conclusion.recommended_corrective_actions || []).forEach(item => {
                const li = document.createElement("li");
                li.style.marginBottom = "6px";
                li.textContent = item;
                correctionsList.appendChild(li);
            });
        }

        if (sectionsChips) {
            sectionsChips.innerHTML = "";
            (conclusion.statutory_sections_referenced || []).forEach(sec => {
                const chip = document.createElement("span");
                chip.className = "badge";
                chip.style = "background: #1e293b; color: #cbd5e1; border: 1px solid rgba(255,255,255,0.08); padding: 5px 12px; font-size: 11.5px;";
                chip.innerHTML = `<i class="fa-solid fa-scale-balanced" style="color:var(--primary); font-size:10px; margin-right:5px;"></i> ${sec}`;
                sectionsChips.appendChild(chip);
            });
        }
    };

    // Sub-renderers for TDS Carry Forward
    const renderTdsCfMasterTable = (rows) => {
        const tbody = document.querySelector("#table-tds-cf-master tbody");
        if (!tbody) return;
        tbody.innerHTML = "";

        const filtered = rows.filter(r => {
            if (currentTdsCfFilter === "claimed" && !r.status.includes("Correctly Claimed")) return false;
            if (currentTdsCfFilter === "carried" && !r.status.includes("Carried Forward") && !r.status.includes("Partial")) return false;
            if (currentTdsCfFilter === "highrisk" && !r.status.includes("🔴")) return false;

            if (currentTdsCfSearch) {
                const q = currentTdsCfSearch.toLowerCase();
                const matchName = (r.deductor || "").toLowerCase().includes(q);
                const matchTan = (r.tan || "").toLowerCase().includes(q);
                const matchSec = (r.tds_section || "").toLowerCase().includes(q);
                const matchStatus = (r.status || "").toLowerCase().includes(q);
                if (!matchName && !matchTan && !matchSec && !matchStatus) return false;
            }
            return true;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="15" style="text-align:center; padding:24px; color:var(--text-muted);">No TDS carry forward entries match the selected filter.</td></tr>`;
            return;
        }

        filtered.forEach(r => {
            const tr = document.createElement("tr");
            const isHighRisk = r.status.includes("🔴");
            if (isHighRisk) tr.style.background = "rgba(239, 68, 68, 0.04)";

            const statusBg = r.status.includes("Correctly Claimed")
                ? "background: rgba(16, 185, 129, 0.15); color: #34d399;"
                : (r.status.includes("Partial") || r.status.includes("Carried") ? "background: rgba(245, 158, 11, 0.15); color: #fbbf24;" : "background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3);");

            tr.innerHTML = `
                <td style="text-align:center; font-weight:600; color:var(--text-muted);">${r.sr_no}</td>
                <td><strong style="color:var(--text-main); font-size:12px;">${r.deductor}</strong></td>
                <td><code style="color:var(--primary); font-size:11px;">${r.tan}</code></td>
                <td><span class="badge" style="background:#1e293b; color:var(--text-main); font-size:10.5px;">${r.tds_section}</span></td>
                <td style="text-align:center; font-size:11px; color:var(--text-muted);">${r.fy_deduction}</td>
                <td style="text-align:right; font-family:monospace; font-size:11.5px;">${formatCurrency(r.gross_amount)}</td>
                <td style="text-align:right; font-family:monospace; font-size:11.5px;">${formatCurrency(r.total_tds)}</td>
                <td style="text-align:right; font-family:monospace; font-size:11.5px; color:var(--success);">${formatCurrency(r.income_taxable_cy)}</td>
                <td style="text-align:right; font-family:monospace; font-size:11.5px; color:var(--warning);">${formatCurrency(r.income_taxable_future)}</td>
                <td style="text-align:right; font-family:monospace; font-size:11.5px;">${formatCurrency(r.tds_eligible_cy)}</td>
                <td style="text-align:right; font-family:monospace; font-size:11.5px; color:var(--primary); font-weight:600;">${formatCurrency(r.tds_claimed)}</td>
                <td style="text-align:right; font-family:monospace; font-size:11.5px; color:var(--warning); font-weight:600;">${formatCurrency(r.tds_to_carry_forward)}</td>
                <td style="text-align:center; font-size:11px; color:var(--primary); font-weight:600;">${r.expected_ay_claim}</td>
                <td style="text-align:center;">
                    <span class="status-badge" style="font-size:10px; padding:3px 6px; ${statusBg}">${r.status}</span>
                </td>
                <td style="font-size:11px; color:var(--text-main); line-height:1.4;">${r.remarks}</td>
            `;
            tbody.appendChild(tr);
        });
    };

    const renderTdsCfRegister = (rows) => {
        const tbody = document.querySelector("#table-tds-cf-register tbody");
        if (!tbody) return;
        tbody.innerHTML = "";
        rows.forEach(r => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>
                    <strong style="color:var(--text-main); font-size:12px;">${r.deductor}</strong>
                    <span style="display:block; font-size:10.5px; color:var(--primary); font-family:monospace;">${r.tan} | ${r.tds_section}</span>
                </td>
                <td style="text-align:center; font-size:11px; color:var(--text-muted);">${r.fy_deduction}</td>
                <td style="text-align:right; font-family:monospace; font-size:11.5px;">${formatCurrency(r.total_tds)}</td>
                <td style="text-align:right; font-family:monospace; font-size:11.5px; color:var(--success);">${formatCurrency(r.income_offered_cy)}</td>
                <td style="text-align:right; font-family:monospace; font-size:11.5px; color:var(--primary); font-weight:600;">${formatCurrency(r.tds_claimed_cy)}</td>
                <td style="text-align:right; font-family:monospace; font-size:11.5px; color:var(--warning); font-weight:700;">${formatCurrency(r.balance_tds_cf)}</td>
                <td style="text-align:center; font-size:11px; color:var(--primary); font-weight:600;">${r.expected_year_claim}</td>
            `;
            tbody.appendChild(tr);
        });
    };

    const renderTdsCfRiskAlerts = (alerts) => {
        const container = document.getElementById("cf-risk-alerts-container");
        if (!container) return;
        container.innerHTML = "";
        alerts.forEach(a => {
            const isHigh = a.severity.includes("HIGH");
            const div = document.createElement("div");
            div.style = `background: ${isHigh ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)'}; border: 1px solid ${isHigh ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}; border-radius: 10px; padding: 12px 14px;`;
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="font-size:12px; font-weight:700; color:${isHigh ? '#f87171' : '#34d399'};"><i class="fa-solid fa-triangle-exclamation" style="margin-right:4px;"></i> ${a.title}</span>
                    <span class="badge" style="background:${isHigh ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}; color:${isHigh ? '#f87171' : '#34d399'}; font-size:10px;">${a.severity}</span>
                </div>
                <p style="font-size:12px; color:var(--text-main); margin:0 0 8px 0; line-height:1.45;">${a.message}</p>
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--text-muted);">
                    <span>Statutory Ref: <code style="color:var(--primary);">${a.relevant_section}</code></span>
                    <span>Tax Impact: <strong style="color:${isHigh ? '#f87171' : '#34d399'}; font-family:monospace;">${formatCurrency(a.tax_impact)}</strong></span>
                </div>
            `;
            container.appendChild(div);
        });
    };

    // Filter Buttons & Search Listeners for TDS Carry Forward
    const cfFilterContainer = document.getElementById("cf-filter-buttons");
    if (cfFilterContainer) {
        cfFilterContainer.addEventListener("click", (e) => {
            const btn = e.target.closest("button");
            if (!btn) return;
            cfFilterContainer.querySelectorAll("button").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentTdsCfFilter = btn.getAttribute("data-filter") || "all";
            if (auditData && auditData.tds_carry_forward_review) {
                renderTdsCfMasterTable(auditData.tds_carry_forward_review.master_table || []);
            }
        });
    }

    const searchTdsCfInput = document.getElementById("search-tds-cf-table");
    if (searchTdsCfInput) {
        searchTdsCfInput.addEventListener("input", (e) => {
            currentTdsCfSearch = e.target.value.trim();
            if (auditData && auditData.tds_carry_forward_review) {
                renderTdsCfMasterTable(auditData.tds_carry_forward_review.master_table || []);
            }
        });
    }

    // =========================================================================
    // Render BS & P&L to ITR Line-by-Line Mapping Review
    // =========================================================================
    let currentBsPlFilter = "all";
    let currentBsPlSearch = "";

    const renderBsPlMappingReview = () => {
        if (!auditData) return;
        const bsplData = auditData.bs_pl_mapping_review || {};
        const masterTable = bsplData.master_mapping_table || [];
        const bsRec = bsplData.balance_sheet_reconciliation || [];
        const plRec = bsplData.pnl_reconciliation || [];
        const crossChecks = bsplData.cross_schedule_checks || [];
        const statutoryAlerts = bsplData.statutory_alerts || [];
        const conclusion = bsplData.final_conclusion || {};

        // Hero Status & Scorecard
        const statusPill = document.getElementById("bspl-status-pill");
        const complianceStatusVal = document.getElementById("bspl-compliance-status-val");
        const bsMatchBadge = document.getElementById("bspl-bs-match-badge");
        const plMatchBadge = document.getElementById("bspl-pl-match-badge");

        const overallStatus = bsplData.overall_status || "PASS";
        const isPass = overallStatus === "PASS";

        if (statusPill) {
            statusPill.className = "badge";
            statusPill.style = `background: ${isPass ? 'rgba(16, 185, 129, 0.18)' : 'rgba(245, 158, 11, 0.18)'}; color: ${isPass ? '#34d399' : '#fbbf24'}; font-size: 11px; padding: 4px 10px; border-radius: 20px;`;
            statusPill.textContent = overallStatus;
        }

        if (complianceStatusVal) {
            complianceStatusVal.textContent = bsplData.overall_compliance_status || "100% Correctly Mapped";
        }

        // Totals from BS & P&L rec tables
        const bsTotalRow = bsRec.find(r => r.particulars.includes("TOTAL")) || {};
        const plTotalRow = plRec.find(r => r.particulars.includes("NET PROFIT")) || {};

        const sumBsBooks = document.getElementById("bspl-sum-bs-books");
        const sumBsItr = document.getElementById("bspl-sum-bs-itr");
        const sumPlBooks = document.getElementById("bspl-sum-pl-books");
        const sumPlItr = document.getElementById("bspl-sum-pl-itr");

        if (sumBsBooks) sumBsBooks.textContent = formatCurrency(bsTotalRow.books_amount || 0);
        if (sumBsItr) sumBsItr.textContent = formatCurrency(bsTotalRow.itr_amount || 0);
        if (sumPlBooks) sumPlBooks.textContent = formatCurrency(plTotalRow.books_amount || 0);
        if (sumPlItr) sumPlItr.textContent = formatCurrency(plTotalRow.itr_amount || 0);

        // Render Tables, Cards & Cross-Checks
        renderBsPlMasterMappingTable(masterTable);
        renderBsReconciliationSummary(bsRec);
        renderPlReconciliationSummary(plRec);
        renderBsPlCrossChecks(crossChecks);
        renderBsPlRiskAlerts(statutoryAlerts);

        // Render Step 6 Final Conclusion Panel
        const conclusionText = document.getElementById("bspl-conclusion-text");
        const checklistList = document.getElementById("bspl-checklist-list");
        const correctionsList = document.getElementById("bspl-corrections-list");
        const sectionsChips = document.getElementById("bspl-sections-chips");
        const finalStatusBadge = document.getElementById("bspl-final-status-badge");

        if (conclusionText) conclusionText.textContent = conclusion.overall_opinion || "No opinion generated.";

        if (finalStatusBadge) {
            finalStatusBadge.style = `background: ${isPass ? 'rgba(16, 185, 129, 0.18)' : 'rgba(245, 158, 11, 0.18)'}; color: ${isPass ? '#34d399' : '#fbbf24'}; font-size: 11.5px; padding: 4px 12px; border-radius: 20px;`;
            finalStatusBadge.textContent = overallStatus.toUpperCase();
        }

        if (checklistList) {
            checklistList.innerHTML = "";
            (conclusion.audit_checklist_findings || []).forEach(item => {
                const li = document.createElement("li");
                li.style.marginBottom = "6px";
                li.textContent = item;
                checklistList.appendChild(li);
            });
        }

        if (correctionsList) {
            correctionsList.innerHTML = "";
            (conclusion.recommended_corrective_actions || []).forEach(item => {
                const li = document.createElement("li");
                li.style.marginBottom = "6px";
                li.textContent = item;
                correctionsList.appendChild(li);
            });
        }

        if (sectionsChips) {
            sectionsChips.innerHTML = "";
            (conclusion.statutory_sections_referenced || []).forEach(sec => {
                const chip = document.createElement("span");
                chip.className = "badge";
                chip.style = "background: #1e293b; color: #cbd5e1; border: 1px solid rgba(255,255,255,0.08); padding: 5px 12px; font-size: 11.5px;";
                chip.innerHTML = `<i class="fa-solid fa-scale-balanced" style="color:var(--primary); font-size:10px; margin-right:5px;"></i> ${sec}`;
                sectionsChips.appendChild(chip);
            });
        }
    };

    // Sub-renderers for BS & P&L Mapping
    const renderBsPlMasterMappingTable = (rows) => {
        const tbody = document.querySelector("#table-bs-pl-master-mapping tbody");
        if (!tbody) return;
        tbody.innerHTML = "";

        const filtered = rows.filter(r => {
            if (currentBsPlFilter === "mapped" && !r.status.includes("Correctly Mapped")) return false;
            if (currentBsPlFilter === "review" && !r.status.includes("Review") && !r.status.includes("Possible Better")) return false;
            if (currentBsPlFilter === "highrisk" && !r.status.includes("🔴")) return false;

            if (currentBsPlSearch) {
                const q = currentBsPlSearch.toLowerCase();
                const matchHead = (r.ledger_head || "").toLowerCase().includes(q);
                const matchNat = (r.nature || "").toLowerCase().includes(q);
                const matchSch = (r.recommended_schedule || "").toLowerCase().includes(q);
                const matchField = (r.recommended_field || "").toLowerCase().includes(q);
                const matchStatus = (r.status || "").toLowerCase().includes(q);
                if (!matchHead && !matchNat && !matchSch && !matchField && !matchStatus) return false;
            }
            return true;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:24px; color:var(--text-muted);">No mapping entries match the selected filter.</td></tr>`;
            return;
        }

        filtered.forEach(r => {
            const tr = document.createElement("tr");
            const isHighRisk = r.status.includes("🔴");
            if (isHighRisk) tr.style.background = "rgba(239, 68, 68, 0.04)";

            const statusBg = r.status.includes("Correctly Mapped")
                ? "background: rgba(16, 185, 129, 0.15); color: #34d399;"
                : (r.status.includes("Review") || r.status.includes("Possible Better") ? "background: rgba(245, 158, 11, 0.15); color: #fbbf24;" : "background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3);");

            tr.innerHTML = `
                <td style="text-align:center; font-weight:600; color:var(--text-muted);">${r.sr_no}</td>
                <td><strong style="color:var(--text-main); font-size:12px;">${r.ledger_head}</strong></td>
                <td style="text-align:right; font-family:monospace; font-size:11.5px;">${formatCurrency(r.amount_books)}</td>
                <td><span class="badge" style="background:#1e293b; color:var(--text-main); font-size:10.5px;">${r.nature}</span></td>
                <td style="font-size:11.5px; color:var(--primary); font-weight:600;">${r.recommended_schedule}</td>
                <td style="font-size:11.5px; color:var(--text-main);"><code style="color:#cbd5e1; font-size:11px;">${r.recommended_field}</code></td>
                <td style="text-align:right; font-family:monospace; font-size:11.5px; color:var(--primary); font-weight:600;">${formatCurrency(r.amount_itr)}</td>
                <td style="text-align:right; font-family:monospace; font-size:11.5px; color:${r.difference === 0 ? 'var(--success)' : '#f87171'}; font-weight:600;">${formatCurrency(r.difference)}</td>
                <td style="text-align:center;">
                    <span class="status-badge" style="font-size:10px; padding:3px 6px; ${statusBg}">${r.status}</span>
                </td>
                <td style="font-size:11px; color:var(--text-main); line-height:1.4;">${r.remarks}</td>
            `;
            tbody.appendChild(tr);
        });
    };

    const renderBsReconciliationSummary = (rows) => {
        const tbody = document.querySelector("#table-bs-reconciliation-summary tbody");
        if (!tbody) return;
        tbody.innerHTML = "";
        rows.forEach(r => {
            const tr = document.createElement("tr");
            const isTotal = r.particulars.includes("TOTAL");
            if (isTotal) tr.style = "background: rgba(56, 189, 248, 0.08); font-weight: 700; border-top: 2px solid rgba(56,189,248,0.3);";
            tr.innerHTML = `
                <td><strong style="color:var(--text-main); font-size:${isTotal ? '12.5px' : '11.5px'};">${r.particulars}</strong></td>
                <td style="text-align:right; font-family:monospace; font-size:11.5px;">${formatCurrency(r.books_amount)}</td>
                <td style="text-align:right; font-family:monospace; font-size:11.5px; color:var(--primary); font-weight:600;">${formatCurrency(r.itr_amount)}</td>
                <td style="text-align:right; font-family:monospace; font-size:11.5px; color:var(--success);">${formatCurrency(r.difference)}</td>
                <td style="text-align:center;">
                    <span class="badge" style="background:rgba(16,185,129,0.15); color:#34d399; font-size:10px; padding:2px 6px;">${r.status}</span>
                </td>
            `;
            tbody.appendChild(tr);
        });
    };

    const renderPlReconciliationSummary = (rows) => {
        const tbody = document.querySelector("#table-pl-reconciliation-summary tbody");
        if (!tbody) return;
        tbody.innerHTML = "";
        rows.forEach(r => {
            const tr = document.createElement("tr");
            const isTotal = r.particulars.includes("NET PROFIT");
            if (isTotal) tr.style = "background: rgba(16, 185, 129, 0.08); font-weight: 700; border-top: 2px solid rgba(16,185,129,0.3);";
            tr.innerHTML = `
                <td><strong style="color:var(--text-main); font-size:${isTotal ? '12.5px' : '11.5px'};">${r.particulars}</strong></td>
                <td style="text-align:right; font-family:monospace; font-size:11.5px;">${formatCurrency(r.books_amount)}</td>
                <td style="text-align:right; font-family:monospace; font-size:11.5px; color:var(--success); font-weight:600;">${formatCurrency(r.itr_amount)}</td>
                <td style="text-align:right; font-family:monospace; font-size:11.5px; color:var(--success);">${formatCurrency(r.difference)}</td>
                <td style="text-align:center;">
                    <span class="badge" style="background:rgba(16,185,129,0.15); color:#34d399; font-size:10px; padding:2px 6px;">${r.status}</span>
                </td>
            `;
            tbody.appendChild(tr);
        });
    };

    const renderBsPlCrossChecks = (checks) => {
        const container = document.getElementById("bspl-cross-checks-container");
        if (!container) return;
        container.innerHTML = "";
        checks.forEach(c => {
            const div = document.createElement("div");
            div.style = "background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); border-radius: 12px; padding: 14px 16px; display:flex; flex-direction:column; justify-content:space-between;";
            div.innerHTML = `
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <span style="font-size: 11px; font-weight: 700; color: var(--primary); text-transform:uppercase;">${c.check_id}: ${c.name}</span>
                        <span class="badge" style="background:rgba(16,185,129,0.18); color:#34d399; font-size:10px;">${c.status}</span>
                    </div>
                    <p style="font-size: 11.5px; color: var(--text-muted); margin: 0 0 8px 0; line-height: 1.4;">${c.condition}</p>
                </div>
                <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px; font-size: 11px; color: var(--text-main);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                        <span>Books: <strong style="font-family:monospace;">${c.books_val}</strong></span>
                        <span>ITR: <strong style="font-family:monospace; color:var(--primary);">${c.itr_val}</strong></span>
                    </div>
                    <span style="display:block; font-size:10.5px; color:var(--text-muted); line-height:1.35;">${c.remarks}</span>
                </div>
            `;
            container.appendChild(div);
        });
    };

    const renderBsPlRiskAlerts = (alerts) => {
        const container = document.getElementById("bspl-risk-alerts-container");
        if (!container) return;
        container.innerHTML = "";
        alerts.forEach(a => {
            const isHigh = a.severity.includes("HIGH") || a.severity.includes("MEDIUM");
            const div = document.createElement("div");
            div.style = `background: ${isHigh ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)'}; border: 1px solid ${isHigh ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)'}; border-radius: 10px; padding: 12px 14px;`;
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="font-size:12px; font-weight:700; color:${isHigh ? '#fbbf24' : '#34d399'};"><i class="fa-solid fa-triangle-exclamation" style="margin-right:4px;"></i> ${a.title}</span>
                    <span class="badge" style="background:${isHigh ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)'}; color:${isHigh ? '#fbbf24' : '#34d399'}; font-size:10px;">${a.severity}</span>
                </div>
                <p style="font-size:12px; color:var(--text-main); margin:0 0 8px 0; line-height:1.45;">${a.message}</p>
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--text-muted);">
                    <span>Statutory Ref: <code style="color:var(--primary);">${a.relevant_section}</code></span>
                    <span>Tax Impact: <strong style="color:${isHigh ? '#fbbf24' : '#34d399'}; font-family:monospace;">${formatCurrency(a.tax_impact)}</strong></span>
                </div>
            `;
            container.appendChild(div);
        });
    };

    // Filter Buttons & Search Listeners for BS-PL Mapping
    const bsplFilterContainer = document.getElementById("bspl-filter-buttons");
    if (bsplFilterContainer) {
        bsplFilterContainer.addEventListener("click", (e) => {
            const btn = e.target.closest("button");
            if (!btn) return;
            bsplFilterContainer.querySelectorAll("button").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentBsPlFilter = btn.getAttribute("data-filter") || "all";
            if (auditData && auditData.bs_pl_mapping_review) {
                renderBsPlMasterMappingTable(auditData.bs_pl_mapping_review.master_mapping_table || []);
            }
        });
    }

    const searchBsPlInput = document.getElementById("search-bs-pl-mapping-table");
    if (searchBsPlInput) {
        searchBsPlInput.addEventListener("input", (e) => {
            currentBsPlSearch = e.target.value.trim();
            if (auditData && auditData.bs_pl_mapping_review) {
                renderBsPlMasterMappingTable(auditData.bs_pl_mapping_review.master_mapping_table || []);
            }
        });
    }

    const updateUploadStatuses = () => {
        const defaultStatus = {
            as26: false, comp: false, itr: false, itr5: false, audit: false, ais: false, xlsx: false, sub: false
        };
        const statusObj = (auditData && auditData.status) ? auditData.status : defaultStatus;
        
        const statusMap = {
            as26: { boxIds: ["box-as26"], badgeIds: ["badge-as26"], name: "26AS" },
            comp: { boxIds: ["box-comp"], badgeIds: ["badge-comp"], name: "Comp" },
            itr: { boxIds: ["box-itr", "box-itr5"], badgeIds: ["badge-itr", "badge-itr5"], name: "ITR" },
            audit: { boxIds: ["box-audit"], badgeIds: ["badge-audit"], name: "3CD" },
            ais: { boxIds: ["box-ais"], badgeIds: ["badge-ais"], name: "AIS" },
            xlsx: { boxIds: ["box-xlsx"], badgeIds: ["badge-xlsx"], name: "Financials" },
            sub: { boxIds: ["box-sub"], badgeIds: [], name: "Sub-Report" }
        };

        for (const [key, cfg] of Object.entries(statusMap)) {
            const exist = !!(statusObj[key] || (key === "itr" && statusObj["itr5"]) || (key === "itr5" && statusObj["itr"]));
            
            cfg.boxIds.forEach(bId => {
                const box = document.getElementById(bId);
                if (box) {
                    const statusBadge = box.querySelector(".upload-status-badge");
                    if (exist) {
                        box.classList.add("uploaded");
                        if (statusBadge) {
                            statusBadge.textContent = "Ready (Server)";
                            statusBadge.className = "upload-status-badge status-success";
                        }
                    } else {
                        box.classList.remove("uploaded");
                        if (statusBadge) {
                            statusBadge.textContent = "Pending Upload";
                            statusBadge.className = "upload-status-badge status-pending";
                        }
                    }
                }
            });

            cfg.badgeIds.forEach(badgeId => {
                const bannerBadge = document.getElementById(badgeId);
                if (bannerBadge) {
                    if (exist) {
                        bannerBadge.className = "badge badge-success";
                        bannerBadge.style = "";
                        bannerBadge.innerHTML = `<i class="fa-solid fa-check"></i> ${cfg.name}`;
                    } else {
                        bannerBadge.className = "badge";
                        bannerBadge.style = "background:#1e293b;color:#94a3b8;";
                        bannerBadge.innerHTML = `<i class="fa-solid fa-circle-dot"></i> ${cfg.name}`;
                    }
                }
            });
        }
    };

    const showLoader = (show, text = "Processing...") => {
        loadingSpinner.style.display = show ? "flex" : "none";
        loaderText.textContent = text;
    };

    // Helper for empty state row in tables
    const renderEmptyStateRow = (tableBody, colSpan = 10) => {
        tableBody.innerHTML = `
            <tr>
                <td colspan="${colSpan}" style="text-align: center; padding: 45px 20px; color: var(--text-muted);">
                    <i class="fa-solid fa-folder-open" style="font-size: 28px; margin-bottom: 10px; display: block; opacity: 0.45; color: var(--primary);"></i>
                    <span style="font-weight: 500; font-size: 14px; color: var(--text-main); display: block; margin-bottom: 4px;">No Reconciliation Data Available</span>
                    <span style="font-size: 12px; opacity: 0.8;">Please upload your tax & audit files in the <strong>Document Upload Center</strong> and click <strong>Reconcile & Run Tax Review</strong>.</span>
                </td>
            </tr>
        `;
    };

    // Populate Top Metrics Card Section
    const populateMetrics = () => {
        if (!auditData) return;
        
        const mapping = auditData.mapping || [];
        const incomeRec = auditData.income_reconciliation || [];
        const summary = auditData.summary || [];
        
        // Status Pill
        const statusPill = document.getElementById("filing-status-pill");
        if (summary.length > 0) {
            const conclusion = summary.find(s => s.category.includes("Readiness") || s.category.includes("Conclusion"));
            if (conclusion && conclusion.details.includes("NOT READY")) {
                statusPill.className = "status-indicator not-ready";
                statusPill.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i><span>NOT READY FOR FILING</span>';
            } else {
                statusPill.className = "status-indicator ready";
                statusPill.innerHTML = '<i class="fa-solid fa-circle-check"></i><span>READY FOR FILING</span>';
            }
        } else {
            statusPill.className = "status-indicator ready";
            statusPill.innerHTML = '<i class="fa-solid fa-clock"></i><span>Awaiting Upload & Analysis</span>';
        }

        // Revenue item
        const llpRevItem = mapping.find(m => m.head === "Revenue from Operations");
        const turnoverEl = document.getElementById("metric-llp-turnover");
        const turnoverSub = document.getElementById("metric-sub-turnover");
        if (llpRevItem && llpRevItem.financials !== undefined) {
            turnoverEl.textContent = formatCurrency(llpRevItem.financials);
            if (turnoverSub) turnoverSub.innerHTML = '<i class="fa-solid fa-circle-check text-success"></i> Active Turnover';
        } else {
            turnoverEl.textContent = "—";
            if (turnoverSub) turnoverSub.innerHTML = '<i class="fa-solid fa-arrow-up-from-bracket"></i> Awaiting Data Upload';
        }

        // PBT item
        const llpPbtItem = incomeRec.find(i => i.particulars === "Profit Before Tax (PBT)");
        const pbtEl = document.getElementById("metric-llp-pbt");
        const pbtSub = document.getElementById("metric-sub-pbt");
        if (llpPbtItem && llpPbtItem.books !== undefined) {
            pbtEl.textContent = formatCurrency(llpPbtItem.books);
            if (pbtSub) pbtSub.innerHTML = '<i class="fa-solid fa-circle-check text-success"></i> P&L Verified';
        } else {
            pbtEl.textContent = "—";
            if (pbtSub) pbtSub.innerHTML = '<i class="fa-solid fa-calculator"></i> Awaiting Data Upload';
        }
        
        // Audit Status item
        const auditEl = document.getElementById("metric-llp-audit");
        const auditSub = document.getElementById("metric-sub-audit");
        const form3cd = auditData.form_3cd || [];
        if (form3cd.length > 0) {
            auditEl.textContent = "u/s 44AB Applicable";
            if (auditSub) auditSub.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-danger"></i> Review Complete';
        } else {
            auditEl.textContent = "—";
            if (auditSub) auditSub.innerHTML = '<i class="fa-solid fa-clipboard-check"></i> Awaiting Data Upload';
        }

        // Partners' Current Account Closing Balance
        const llpCurrentItem = mapping.find(m => m.head === "Owner's Current Account");
        const currentEl = document.getElementById("metric-llp-current");
        const currentSub = document.getElementById("metric-sub-current");
        if (llpCurrentItem && llpCurrentItem.financials !== undefined) {
            currentEl.textContent = formatCurrency(llpCurrentItem.financials);
            if (currentSub) currentSub.innerHTML = '<i class="fa-solid fa-circle-check text-success"></i> Capital Verified';
        } else {
            currentEl.textContent = "—";
            if (currentSub) currentSub.innerHTML = '<i class="fa-solid fa-users"></i> Awaiting Data Upload';
        }
    };

    // Render Sheet 1: Master Observation Log
    const renderMasterLog = () => {
        const tableBody = document.querySelector("#table-master-log tbody");
        tableBody.innerHTML = "";
        
        const logs = auditData.master_log || [];
        if (logs.length === 0) {
            renderEmptyStateRow(tableBody, 5);
            return;
        }
        logs.forEach(log => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="text-align: center; font-weight: 600;">${log.sr_no}</td>
                <td style="font-weight: 500; color: var(--primary);">${log.particulars}</td>
                <td>${log.observation}</td>
                <td>${log.correction}</td>
                <td style="text-align: center;">
                    <span class="risk-badge ${log.risk ? log.risk.toLowerCase() : 'low'}">${log.risk || 'Info'}</span>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    };

    // Render Sheet 2: Form 26AS
    const renderForm26AS = () => {
        const tableBody = document.querySelector("#table-26as tbody");
        tableBody.innerHTML = "";
        
        const entries = auditData.reconciliation_26as || [];
        if (entries.length === 0) {
            renderEmptyStateRow(tableBody, 7);
            return;
        }
        entries.forEach(entry => {
            const tr = document.createElement("tr");
            const diffClass = entry.difference !== 0 && entry.section !== "194-IA" ? "cell-unverifiable" : "";
            tr.innerHTML = `
                <td>${entry.deductor}</td>
                <td style="text-align: center;">${entry.section}</td>
                <td style="text-align: right;">${formatCurrency(entry.amount_26as)}</td>
                <td style="text-align: right;">${formatCurrency(entry.amount_books)}</td>
                <td style="text-align: right;">${formatCurrency(entry.amount_itr)}</td>
                <td style="text-align: right; font-weight: 600;" class="${diffClass}">${formatCurrency(entry.difference)}</td>
                <td style="font-style: italic; color: var(--text-muted);">${entry.reason}</td>
            `;
            tableBody.appendChild(tr);
        });
    };

    // Render Sheet 3: AIS / TIS
    const renderAisTis = () => {
        const tableBody = document.querySelector("#table-ais-tis tbody");
        tableBody.innerHTML = "";
        
        const entries = auditData.reconciliation_ais_tis || [];
        if (entries.length === 0) {
            renderEmptyStateRow(tableBody, 6);
            return;
        }
        entries.forEach(entry => {
            const tr = document.createElement("tr");
            const diffClass = entry.difference !== 0 && !entry.transaction.includes("GSTR-3B") && !entry.transaction.includes("SFT-012") ? "cell-unverifiable" : "";
            tr.innerHTML = `
                <td>${entry.transaction}</td>
                <td style="text-align: right;">${formatCurrency(entry.ais_amount)}</td>
                <td style="text-align: right;">${formatCurrency(entry.books_amount)}</td>
                <td style="text-align: right;">${formatCurrency(entry.itr_disclosure)}</td>
                <td style="text-align: right; font-weight: 600;" class="${diffClass}">${formatCurrency(entry.difference)}</td>
                <td style="font-style: italic; color: var(--text-muted);">${entry.remarks}</td>
            `;
            tableBody.appendChild(tr);
        });
    };

    // Render Sheet 4: Balance Sheet & P&L Mapping
    const renderBsPlMapping = () => {
        const tableBody = document.querySelector("#table-bs-pl tbody");
        tableBody.innerHTML = "";
        
        const mappings = auditData.mapping || [];
        if (mappings.length === 0) {
            renderEmptyStateRow(tableBody, 7);
            return;
        }
        mappings.forEach(map => {
            const tr = document.createElement("tr");
            tr.setAttribute("data-search", `${(map.entity||'').toLowerCase()} ${(map.head||'').toLowerCase()} ${(map.schedule||'').toLowerCase()}`);
            const itrClass = map.match === "Y" ? "" : "cell-unverifiable";
            const formattedItr = typeof map.itr_amount === "number" ? formatCurrency(map.itr_amount) : map.itr_amount;
            tr.innerHTML = `
                <td style="font-weight: 600; color: var(--text-muted);">${map.entity || '—'}</td>
                <td style="font-weight: 500;">${map.head}</td>
                <td style="text-align: right; font-weight: 600; color: var(--text-main);">${formatCurrency(map.financials)}</td>
                <td style="color: var(--primary); font-size: 12px; font-family: monospace;">${map.schedule}</td>
                <td style="text-align: right; font-weight: 600;" class="${itrClass}">${formattedItr}</td>
                <td style="text-align: center;">
                    <span class="match-badge ${(map.match||'').toLowerCase()}">${map.match || '—'}</span>
                </td>
                <td style="font-size: 12px; color: var(--text-muted);">${map.remarks || '—'}</td>
            `;
            tableBody.appendChild(tr);
        });
    };

    // Client-side filtering for Balance Sheet & P&L Mapping
    searchBsPl.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();
        const rows = document.querySelectorAll("#table-bs-pl tbody tr");
        rows.forEach(row => {
            const text = row.getAttribute("data-search");
            if (text && text.includes(query)) {
                row.style.display = "";
            } else if (text) {
                row.style.display = "none";
            }
        });
    });

    // Render Sheet 5: Income Reconciliation
    const renderIncomeRec = () => {
        const tableBody = document.querySelector("#table-income-rec tbody");
        tableBody.innerHTML = "";
        
        const entries = auditData.income_reconciliation || [];
        if (entries.length === 0) {
            renderEmptyStateRow(tableBody, 9);
            return;
        }
        entries.forEach(entry => {
            const tr = document.createElement("tr");
            
            // Format dynamic fields (handles strings and numbers)
            const fmtBooks = typeof entry.books === "number" ? formatCurrency(entry.books) : entry.books;
            const fmtAdd = typeof entry.add === "number" ? formatCurrency(entry.add) : entry.add;
            const fmtLess = typeof entry.less === "number" ? formatCurrency(entry.less) : entry.less;
            const fmtComp = typeof entry.computation === "number" ? formatCurrency(entry.computation) : entry.computation;
            const fmtItr = typeof entry.itr === "number" ? formatCurrency(entry.itr) : entry.itr;
            const fmtDiff = typeof entry.difference === "number" ? formatCurrency(entry.difference) : entry.difference;

            tr.innerHTML = `
                <td style="font-weight: 600; color: var(--text-muted);">${entry.entity || '—'}</td>
                <td style="font-weight: 500; color: var(--primary);">${entry.particulars}</td>
                <td style="text-align: right;">${fmtBooks}</td>
                <td style="text-align: right; color: var(--danger);">${fmtAdd}</td>
                <td style="text-align: right; color: var(--success);">${fmtLess}</td>
                <td style="text-align: right; font-weight: 600;">${fmtComp}</td>
                <td class="cell-unverifiable">${fmtItr}</td>
                <td class="cell-unverifiable">${fmtDiff}</td>
                <td style="font-size: 12px; color: var(--text-muted);">${entry.remarks}</td>
            `;
            tableBody.appendChild(tr);
        });
    };

    // Render Sheet 6: Form 3CD
    const renderForm3CD = () => {
        const tableBody = document.querySelector("#table-form-3cd tbody");
        tableBody.innerHTML = "";
        
        const clauses = auditData.form_3cd || [];
        if (clauses.length === 0) {
            renderEmptyStateRow(tableBody, 6);
            return;
        }
        clauses.forEach(cl => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="font-weight: 500; color: var(--primary);">${cl.particulars}</td>
                <td>${cl.financials}</td>
                <td style="font-family: monospace; font-size: 12px; color: var(--warning); text-align: center;">${cl.clause}</td>
                <td style="text-align: center;">${cl.computation}</td>
                <td style="text-align: center; color: var(--primary); font-family: monospace; font-size: 12px;">${cl.itr_schedule}</td>
                <td style="font-size: 12px; color: var(--text-muted);">${cl.remarks}</td>
            `;
            tableBody.appendChild(tr);
        });
    };

    // Render Sheet 7: Prior Year Comparison
    const renderPriorYear = () => {
        const tableBody = document.querySelector("#table-prior-year tbody");
        tableBody.innerHTML = "";
        
        const comparisons = auditData.prior_year || [];
        if (comparisons.length === 0) {
            renderEmptyStateRow(tableBody, 8);
            return;
        }
        comparisons.forEach(comp => {
            const tr = document.createElement("tr");
            const fmtPrior = formatCurrency(comp.prior);
            const fmtCurrent = formatCurrency(comp.current);
            const fmtChange = formatCurrency(comp.change);
            
            // Format percentage
            const fmtPct = typeof comp.change_pct === "number" ? comp.change_pct.toFixed(2) + "%" : comp.change_pct;
            const changeColor = comp.change >= 0 ? "text-success" : "text-danger";
            const changeIcon = comp.change >= 0 ? "fa-arrow-trend-up" : "fa-arrow-trend-down";

            tr.innerHTML = `
                <td style="font-weight: 600; color: var(--text-muted);">${comp.entity || '—'}</td>
                <td style="font-weight: 500;">${comp.particulars}</td>
                <td style="text-align: right;">${fmtPrior}</td>
                <td style="text-align: right; color: var(--text-main); font-weight: 600;">${fmtCurrent}</td>
                <td style="text-align: right;" class="${changeColor}">${fmtChange}</td>
                <td style="text-align: right;" class="${changeColor} bold"><i class="fa-solid ${changeIcon}" style="font-size: 10px; margin-right: 4px;"></i>${fmtPct}</td>
                <td style="text-align: center;">
                    <span class="match-badge ${(comp.material||'').toLowerCase()}">${comp.material || '—'}</span>
                </td>
                <td style="font-size: 12px; color: var(--text-muted);">${comp.remarks || '—'}</td>
            `;
            tableBody.appendChild(tr);
        });
    };

    // Render Sheet 8: Summary (Lists of missing docs and corrections)
    const renderSummary = () => {
        const listMissingDocs = document.getElementById("list-missing-docs");
        const listCorrections = document.getElementById("list-corrections");
        
        listMissingDocs.innerHTML = "";
        listCorrections.innerHTML = "";

        const summary = auditData.summary || [];
        
        if (summary.length === 0) {
            listMissingDocs.innerHTML = '<li style="color:var(--text-muted);font-style:italic;">No missing documents reported. Awaiting data upload.</li>';
            listCorrections.innerHTML = '<li style="color:var(--text-muted);font-style:italic;">No corrections required. Awaiting data upload.</li>';
            return;
        }

        // Find missing docs details
        const missingDocsItem = summary.find(s => s.category === "Missing Information / Documents");
        if (missingDocsItem) {
            const items = missingDocsItem.details.split("\n");
            items.forEach(item => {
                const li = document.createElement("li");
                li.textContent = item;
                listMissingDocs.appendChild(li);
            });
        } else {
            listMissingDocs.innerHTML = '<li style="color:var(--text-muted);font-style:italic;">No missing documents reported.</li>';
        }

        // Find corrections details
        const correctionsItem = summary.find(s => s.category === "Consolidated Corrections Required");
        if (correctionsItem) {
            const items = correctionsItem.details.split("\n");
            items.forEach(item => {
                const li = document.createElement("li");
                li.textContent = item;
                listCorrections.appendChild(li);
            });
        } else {
            listCorrections.innerHTML = '<li style="color:var(--text-muted);font-style:italic;">No corrections required.</li>';
        }
    };

    // Export Excel Button
    btnExportExcel.addEventListener("click", () => {
        window.location.href = `${API_BASE}/api/export`;
    });

    // Reset and Clear Previous Results Handler
    const resetAllData = async () => {
        const confirmed = confirm("Are you sure you want to remove all previous results and clear all uploaded files? This will reset the portal to its initial state.");
        if (!confirmed) return;

        showLoader(true, "Clearing all previous results and documents...");

        try {
            const response = await fetch(`${API_BASE}/api/reset`, {
                method: "POST"
            });

            if (!response.ok) {
                throw new Error("Failed to clear data on server.");
            }

            // Reset state
            auditData = null;
            uploadedFiles = {
                as26: null,
                comp: null,
                itr5: null,
                audit: null,
                ais: null,
                xlsx: null,
                sub: null
            };

            // Reset file inputs
            uploadConfigs.forEach(cfg => {
                const input = document.getElementById(cfg.inputId);
                if (input) input.value = "";
            });

            // Reload fresh clean data from API
            await loadDashboardData();

            showLoader(false);
            showToast("All previous results and uploaded documents cleared successfully.", "info");

        } catch (error) {
            console.error("Error clearing results:", error);
            showLoader(false);
            showToast("Failed to clear previous results. Please try again.", "error");
        }
    };

    if (btnResetData) {
        btnResetData.addEventListener("click", resetAllData);
    }
    if (btnResetTop) {
        btnResetTop.addEventListener("click", resetAllData);
    }

    // Start App by loading dashboard data
    loadDashboardData();
});
