(function (window, document) {
  'use strict';

  // Global namespace for teammate integration hooks
  window.PortalUI = window.PortalUI || {};

  /* ==========================================================================
     1. APPLICATION STATE & CATEGORY COMPLIANCE BLUEPRINTS
     ========================================================================== */
  const state = {
    currentRole: sessionStorage.getItem('portal_user_role') || null, // 'vendor' | 'manager' | null
    selectedAuthRole: 'vendor', // 'vendor' | 'manager'
    currentMainView: 'auth',   // 'auth' | 'vendor' | 'manager'
    currentSection: 'dashboard',
    
    // Multi-Step Onboarding Form State
    form: {
      currentStep: 1,
      totalSteps: 3,
      isEinVerified: false,
      selectedCategory: 'Logistics / Freight',
      uploadedDocuments: {} // { docKey: { name, size, type, uploadDate, expiryDate } }
    },

    // Manager Data Table State
    table: {
      allVendors: [],
      filteredVendors: [],
      sortField: 'name',
      sortDirection: 'asc', // 'asc' | 'desc'
      searchQuery: '',
      statusFilter: 'all',  // 'all' | 'Approved' | 'Pending' | 'Blocked'
      riskTierFilter: 'all',// 'all' | 'Tier 1' | 'Tier 2' | 'Tier 3'
      categoryFilter: 'all',
      expiringDaysFilter: 'all', // 'all' | '30' | '60' | '90'
      currentPage: 1,
      pageSize: 8
    },

    // Category-Driven Dynamic Document Stack Requirements
    complianceRequirements: {
      'Logistics / Freight': [
        { id: 'w9_form', title: 'IRS Form W-9 / Taxpayer Identification', mandatory: true, description: 'Signed and dated within the current tax year.' },
        { id: 'cert_insurance', title: 'Commercial Carrier Liability Insurance ($1,000,000)', mandatory: true, description: 'Certificate of Insurance (COI) naming procurement entity as certificate holder.' },
        { id: 'signed_nda', title: 'Corporate Non-Disclosure Agreement (Mutual NDA)', mandatory: true, description: 'Executed bilateral non-disclosure agreement.' },
        { id: 'dot_safety_rating', title: 'DOT Safety Rating & FMCSA Operating Authority', mandatory: true, description: 'Official Federal Motor Carrier Safety Administration certification.' }
      ],
      'IT / Cloud Services': [
        { id: 'w9_form', title: 'IRS Form W-9 / Taxpayer Identification', mandatory: true, description: 'Signed and dated within the current tax year.' },
        { id: 'cert_insurance', title: 'Cyber Liability & Data Breach Policy ($2,000,000)', mandatory: true, description: 'Certificate of Insurance covering security incident response and liability.' },
        { id: 'signed_nda', title: 'Corporate Non-Disclosure Agreement (Mutual NDA)', mandatory: true, description: 'Executed bilateral non-disclosure agreement.' },
        { id: 'soc2_report', title: 'SOC 2 Type II Security & Confidentiality Audit Report', mandatory: true, description: 'Independent auditor attestation of security controls.' }
      ],
      'Manufacturing / Raw Materials': [
        { id: 'w9_form', title: 'IRS Form W-9 / Taxpayer Identification', mandatory: true, description: 'Signed and dated within the current tax year.' },
        { id: 'cert_insurance', title: 'Comprehensive Commercial General Liability ($2,000,000)', mandatory: true, description: 'COI with product completed operations aggregate coverage.' },
        { id: 'signed_nda', title: 'Corporate Non-Disclosure Agreement (Mutual NDA)', mandatory: true, description: 'Executed bilateral non-disclosure agreement.' },
        { id: 'iso9001_cert', title: 'ISO 9001:2015 Quality Management Certificate', mandatory: true, description: 'Accredited registrar certificate covering production facilities.' }
      ],
      'Consulting / Professional Services': [
        { id: 'w9_form', title: 'IRS Form W-9 / Taxpayer Identification', mandatory: true, description: 'Signed and dated within the current tax year.' },
        { id: 'cert_insurance', title: 'Professional Indemnity / Errors & Omissions ($1,000,000)', mandatory: true, description: 'COI covering professional advisory and malpractice scope.' },
        { id: 'signed_nda', title: 'Corporate Non-Disclosure Agreement (Mutual NDA)', mandatory: true, description: 'Executed bilateral non-disclosure agreement.' },
        { id: 'cert_incorporation', title: 'Certificate of Incorporation / State Good Standing', mandatory: true, description: 'Active state charter or legal authority registration.' }
      ]
    }
  };

  // Chart Instances
  let statusChartInstance = null;
  let riskChartInstance = null;
  let currentReviewVendor = null;

  /* ==========================================================================
     2. INITIALIZATION & SHELL ROUTING
     ========================================================================== */
  function init() {
    bindInteractiveAuthRoleToggle();
    bindAuthButtons();
    bindSidebarNavigation();
    bindMobileOffcanvas();
    bindVendorFormControls();
    bindManagerTableControls();
    bindReviewModalActions();
    bindExportButtons();
    bindTeammateCustomEventConsumers();
    setupA11yKeyboardTraps();
    initCharts();

    // Check pre-existing session role
    const savedRole = sessionStorage.getItem('portal_user_role');
    if (savedRole === 'vendor') {
      selectRole('vendor', false);
    } else if (savedRole === 'manager') {
      selectRole('manager', false);
    } else {
      switchMainView('auth');
      setInteractiveAuthRole('vendor');
    }

    // Seed mock data for instant demo responsiveness
    seedInitialDemoData();
  }

  /* ==========================================================================
     3. VIEW-SWITCHING & ROLE MANAGEMENT
     ========================================================================== */
  /**
   * Smoothly toggles between the three main SPA view containers:
   * 1. #view-auth    (Role Selection / Login View)
   * 2. #view-vendor  (Vendor Onboarding & Status Portal)
   * 3. #view-manager (Procurement Manager Compliance Dashboard)
   * @param {'auth'|'vendor'|'manager'} targetView 
   */
  function switchMainView(targetView) {
    state.currentMainView = targetView;

    const viewAuth = document.getElementById('view-auth');
    const viewVendor = document.getElementById('view-vendor');
    const viewManager = document.getElementById('view-manager');
    const appShell = document.getElementById('portalAppShell');

    if (viewAuth) viewAuth.classList.toggle('d-none', targetView !== 'auth');
    if (appShell) appShell.classList.toggle('d-none', targetView === 'auth');
    if (viewVendor) viewVendor.classList.toggle('d-none', targetView !== 'vendor');
    if (viewManager) viewManager.classList.toggle('d-none', targetView !== 'manager');

    if (targetView === 'manager') {
      if (statusChartInstance) statusChartInstance.resize();
      if (riskChartInstance) riskChartInstance.resize();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Dispatch view-changed event for Abhinaba's state machine
    window.dispatchEvent(new CustomEvent('portal:view-changed', {
      detail: { mainView: targetView, timestamp: new Date().toISOString() }
    }));
  }

  /**
   * Role Selection Handler (Vendor vs Manager)
   * @param {'vendor'|'manager'} role 
   * @param {boolean} [notify=true] 
   */
  function selectRole(role, notify = true) {
    if (role !== 'vendor' && role !== 'manager') return;

    state.currentRole = role;
    sessionStorage.setItem('portal_user_role', role);

    updateProfileBadge(role);
    updateSidebarNavScope(role);

    if (role === 'vendor') {
      switchMainView('vendor');
      if (notify) {
        showSuccessToast('Authenticated as External Vendor Representative.', 'Vendor Portal Active');
      }
    } else {
      switchMainView('manager');
      if (notify) {
        showSuccessToast('Authenticated as Procurement Governance Manager.', 'Manager Portal Active');
      }
    }

    // Dispatch event for Abhinaba's RBAC engine & JSON state loader
    window.dispatchEvent(new CustomEvent('portal:role-changed', {
      detail: { role: role, timestamp: new Date().toISOString() }
    }));
  }

  /**
   * Interactive Role Selection Toggle in #view-auth with visual active states
   */
  function bindInteractiveAuthRoleToggle() {
    const radioVendor = document.getElementById('authToggleVendor');
    const radioManager = document.getElementById('authToggleManager');
    const cardVendor = document.getElementById('authCardVendor');
    const cardManager = document.getElementById('authCardManager');

    if (radioVendor) {
      radioVendor.addEventListener('change', () => {
        if (radioVendor.checked) setInteractiveAuthRole('vendor');
      });
    }

    if (radioManager) {
      radioManager.addEventListener('change', () => {
        if (radioManager.checked) setInteractiveAuthRole('manager');
      });
    }

    if (cardVendor) {
      cardVendor.addEventListener('click', (e) => {
        if (!e.target.closest('button')) {
          setInteractiveAuthRole('vendor');
          if (radioVendor) radioVendor.checked = true;
        }
      });
    }

    if (cardManager) {
      cardManager.addEventListener('click', (e) => {
        if (!e.target.closest('button')) {
          setInteractiveAuthRole('manager');
          if (radioManager) radioManager.checked = true;
        }
      });
    }
  }

  /**
   * Applies visual active states on the role cards in #view-auth
   * @param {'vendor'|'manager'} role 
   */
  function setInteractiveAuthRole(role) {
    state.selectedAuthRole = role;

    const cardVendor = document.getElementById('authCardVendor');
    const cardManager = document.getElementById('authCardManager');
    const badgeVendor = document.getElementById('authBadgeVendor');
    const badgeManager = document.getElementById('authBadgeManager');

    if (role === 'vendor') {
      if (cardVendor) {
        cardVendor.classList.add('border-primary', 'shadow-lg', 'bg-primary-subtle', 'bg-opacity-10');
        cardVendor.classList.remove('border-slate-200');
      }
      if (cardManager) {
        cardManager.classList.remove('border-primary', 'shadow-lg', 'bg-primary-subtle', 'bg-opacity-10');
        cardManager.classList.add('border-slate-200');
      }
      if (badgeVendor) badgeVendor.classList.remove('d-none');
      if (badgeManager) badgeManager.classList.add('d-none');
    } else {
      if (cardManager) {
        cardManager.classList.add('border-primary', 'shadow-lg', 'bg-primary-subtle', 'bg-opacity-10');
        cardManager.classList.remove('border-slate-200');
      }
      if (cardVendor) {
        cardVendor.classList.remove('border-primary', 'shadow-lg', 'bg-primary-subtle', 'bg-opacity-10');
        cardVendor.classList.add('border-slate-200');
      }
      if (badgeManager) badgeManager.classList.remove('d-none');
      if (badgeVendor) badgeVendor.classList.add('d-none');
    }
  }

  function updateProfileBadge(role) {
    const roleBadge = document.getElementById('sidebarRoleBadge');
    const topbarRoleBadge = document.getElementById('topbarRoleBadge');
    const userNameEl = document.getElementById('sidebarUserName');
    const userRoleTextEl = document.getElementById('sidebarUserRole');
    const avatarEl = document.getElementById('sidebarUserAvatar');
    const topbarTitle = document.getElementById('topbarTitle');

    if (role === 'vendor') {
      if (roleBadge) {
        roleBadge.className = 'role-pill role-pill-vendor';
        roleBadge.innerHTML = '<i class="bi bi-person-badge"></i> Vendor POC';
      }
      if (topbarRoleBadge) {
        topbarRoleBadge.className = 'role-pill role-pill-vendor';
        topbarRoleBadge.innerHTML = '<i class="bi bi-person-badge"></i> Vendor POC';
      }
      if (userNameEl) userNameEl.textContent = 'Mohd. Maaz Khan';
      if (userRoleTextEl) userRoleTextEl.textContent = 'Authorized Vendor Agent';
      if (avatarEl) avatarEl.textContent = 'MK';
      if (topbarTitle) topbarTitle.textContent = 'Vendor Onboarding & Status Portal';
    } else {
      if (roleBadge) {
        roleBadge.className = 'role-pill role-pill-manager';
        roleBadge.innerHTML = '<i class="bi bi-shield-check"></i> Procurement Manager';
      }
      if (topbarRoleBadge) {
        topbarRoleBadge.className = 'role-pill role-pill-manager';
        topbarRoleBadge.innerHTML = '<i class="bi bi-shield-check"></i> Procurement Manager';
      }
      if (userNameEl) userNameEl.textContent = 'Mohd. Maaz Khan';
      if (userRoleTextEl) userRoleTextEl.textContent = 'Sr. Procurement Lead';
      if (avatarEl) avatarEl.textContent = 'MK';
      if (topbarTitle) topbarTitle.textContent = 'Procurement Compliance Dashboard';
    }
  }

  function updateSidebarNavScope(role) {
    document.querySelectorAll('[data-role-scope]').forEach(el => {
      const scope = el.getAttribute('data-role-scope');
      if (scope === 'all' || scope === role) {
        el.classList.remove('d-none');
      } else {
        el.classList.add('d-none');
      }
    });
  }

  function bindAuthButtons() {
    document.querySelectorAll('[data-auth-role]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const role = btn.getAttribute('data-auth-role');
        selectRole(role, true);
      });
    });

    document.querySelectorAll('[data-action-logout]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        sessionStorage.removeItem('portal_user_role');
        state.currentRole = null;
        switchMainView('auth');
        showToast('Signed out of active portal session.', 'info', 'Session Ended');
      });
    });
  }

  function bindSidebarNavigation() {
    const navLinks = document.querySelectorAll('[data-portal-nav]');
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const navTarget = link.getAttribute('data-portal-nav');
        handleNavClick(navTarget);

        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        const offcanvasEl = document.getElementById('mobileSidebarOffcanvas');
        if (offcanvasEl) {
          const bsOffcanvas = bootstrap.Offcanvas.getInstance(offcanvasEl);
          if (bsOffcanvas) bsOffcanvas.hide();
        }
      });
    });
  }

  function handleNavClick(navTarget) {
    state.currentSection = navTarget;
    const role = (window.PortalAuth && window.PortalAuth.getCurrentUser() && window.PortalAuth.getCurrentUser().role) 
      || state.currentRole || 'manager';

    if (role === 'superadmin') {
      if (navTarget === 'dashboard') {
        const viewEl = document.getElementById('view-superadmin');
        if (viewEl) viewEl.scrollIntoView({ behavior: 'smooth' });
      } else if (navTarget === 'compliance') {
        const queueTable = document.getElementById('superAdminQueueTableBody');
        if (queueTable) queueTable.scrollIntoView({ behavior: 'smooth' });
      } else if (navTarget === 'analytics') {
        const kpis = document.getElementById('superAdminKpiPending');
        if (kpis) kpis.scrollIntoView({ behavior: 'smooth' });
      } else if (navTarget === 'settings') {
        const settingsModal = document.getElementById('systemSettingsModal');
        if (settingsModal) {
          const bsModal = bootstrap.Modal.getOrCreateInstance(settingsModal);
          bsModal.show();
        }
      }
    } else if (role === 'admin') {
      if (navTarget === 'dashboard') {
        const viewEl = document.getElementById('view-admin');
        if (viewEl) viewEl.scrollIntoView({ behavior: 'smooth' });
      } else if (navTarget === 'compliance') {
        const mgrQueue = document.getElementById('adminManagerQueueTableBody');
        if (mgrQueue) mgrQueue.scrollIntoView({ behavior: 'smooth' });
      } else if (navTarget === 'analytics') {
        const adminKpi = document.getElementById('adminKpiPendingManagers');
        if (adminKpi) adminKpi.scrollIntoView({ behavior: 'smooth' });
      } else if (navTarget === 'settings') {
        const settingsModal = document.getElementById('systemSettingsModal');
        if (settingsModal) {
          const bsModal = bootstrap.Modal.getOrCreateInstance(settingsModal);
          bsModal.show();
        }
      }
    } else if (role === 'vendor') {
      if (navTarget === 'dashboard' || navTarget === 'compliance') {
        const wizardTabBtn = document.getElementById('tabVendorWizardBtn');
        if (wizardTabBtn) wizardTabBtn.click();
      } else if (navTarget === 'analytics' || navTarget === 'settings') {
        const statusTabBtn = document.getElementById('tabVendorStatusBtn');
        if (statusTabBtn) statusTabBtn.click();
      }
    } else {
      if (navTarget === 'dashboard') {
        const regTab = document.getElementById('mgrTabRegisterBtn');
        if (regTab) regTab.click();
        const tableCard = document.getElementById('managerTableCard');
        if (tableCard) tableCard.scrollIntoView({ behavior: 'smooth' });
      } else if (navTarget === 'compliance') {
        const reqTab = document.getElementById('mgrTabRequirementsBtn');
        if (reqTab) reqTab.click();
      } else if (navTarget === 'analytics') {
        const regTab = document.getElementById('mgrTabRegisterBtn');
        if (regTab) regTab.click();
        const chartsSection = document.getElementById('managerAnalyticsSection');
        if (chartsSection) chartsSection.scrollIntoView({ behavior: 'smooth' });
      } else if (navTarget === 'settings') {
        const settingsModal = document.getElementById('systemSettingsModal');
        if (settingsModal) {
          const bsModal = bootstrap.Modal.getOrCreateInstance(settingsModal);
          bsModal.show();
        }
      }
    }
  }

  function bindMobileOffcanvas() {
    const toggleBtn = document.getElementById('mobileSidebarToggle');
    const offcanvasEl = document.getElementById('mobileSidebarOffcanvas');
    if (toggleBtn && offcanvasEl) {
      toggleBtn.addEventListener('click', () => {
        const bsOffcanvas = bootstrap.Offcanvas.getOrCreateInstance(offcanvasEl);
        bsOffcanvas.show();
      });
    }
  }

  /* ==========================================================================
     4. MULTI-STEP DYNAMIC FORM & PROGRESS BAR (setStep, renderUploadRows)
     ========================================================================== */
  function bindVendorFormControls() {
    bindStepperButtons();
    bindCategoryChange();
    bindEinVerification();
    bindRealTimeProgressListeners();
    renderUploadRows(state.form.selectedCategory);
    updateStepperUI();
    recalculateProgress();
  }

  function bindCategoryChange() {
    const categorySelect = document.getElementById('vendorCategory');
    if (!categorySelect) return;

    categorySelect.addEventListener('change', (e) => {
      const selected = e.target.value;
      if (state.complianceRequirements[selected]) {
        state.form.selectedCategory = selected;
        state.form.uploadedDocuments = {};
        renderUploadRows(selected);
        recalculateProgress();

        showToast(
          `Updated compliance document requirements for category: ${selected}`,
          'info',
          'Checklist Updated'
        );
      }
    });
  }

  /**
   * Sample UI Rendering Function: renderUploadRows(category)
   * Dynamically renders DocumentUploadRow components containing:
   * 1. Document Name
   * 2. Expiration Date picker (input[type="date"])
   * 3. Quota-safe simulated File Upload button with file name display
   * 4. Real-time validation status icon
   * @param {string} category 
   */
  function renderUploadRows(category) {
    const container = document.getElementById('dynamicDocsContainer');
    if (!container) return;

    const requirements = state.complianceRequirements[category] || state.complianceRequirements['Logistics / Freight'];
    const minDate = getTodayDateString();

    let html = `
      <div class="alert alert-light border border-slate-200 mb-4 py-2 px-3 d-flex align-items-center justify-content-between">
        <div>
          <span class="badge bg-primary text-white me-2">${category}</span>
          <span class="text-secondary small fw-medium">Compliance Document Stack (${requirements.length} Required Files)</span>
        </div>
        <small class="text-muted"><i class="bi bi-shield-lock-fill text-primary me-1"></i> Quota-Safe Metadata Mode</small>
      </div>
    `;

    requirements.forEach((doc) => {
      const docKey = doc.id;
      const uploaded = state.form.uploadedDocuments[docKey];
      const hasValidUpload = uploaded && uploaded.name;
      const hasValidExpiry = uploaded && uploaded.expiryDate && !isDateExpired(uploaded.expiryDate);
      const isComplete = hasValidUpload && hasValidExpiry;

      html += `
        <!-- DocumentUploadRow Component -->
        <div class="document-upload-row ${isComplete ? 'is-uploaded' : ''}" id="docRow_${docKey}">
          <div class="row g-3 align-items-center">
            
            <!-- 1. Document Name & Status Icon -->
            <div class="col-lg-5 col-md-12">
              <div class="d-flex align-items-start gap-2">
                <span id="validIcon_${docKey}" class="doc-valid-icon flex-shrink-0 mt-1">
                  ${isComplete 
                    ? '<i class="bi bi-check-circle-fill text-success fs-5" title="Document Valid"></i>' 
                    : '<i class="bi bi-dash-circle text-muted fs-5" title="Document Incomplete"></i>'}
                </span>
                <div>
                  <div class="fw-semibold text-dark" style="font-size:0.92rem;">
                    ${doc.title} ${doc.mandatory ? '<span class="text-danger">*</span>' : ''}
                  </div>
                  <div class="text-muted small">${doc.description}</div>
                </div>
              </div>
            </div>

            <!-- 2. Quota-Safe Simulated File Upload Button with Live File Name Display -->
            <div class="col-lg-4 col-md-6">
              <label for="fileInput_${docKey}" class="form-label small fw-semibold d-block mb-1">
                Attach PDF Document <span class="text-danger">*</span>
              </label>
              <div class="d-flex align-items-center flex-wrap gap-2">
                <label for="fileInput_${docKey}" class="btn btn-outline-primary btn-sm mb-0">
                  <i class="bi bi-upload me-1"></i> Choose PDF
                </label>
                <input type="file" 
                       class="doc-file-input visually-hidden" 
                       id="fileInput_${docKey}" 
                       name="file_${docKey}" 
                       data-doc-key="${docKey}"
                       accept=".pdf,application/pdf"
                       ${doc.mandatory && !uploaded ? 'required' : ''}>
                
                <span id="fileNameDisplay_${docKey}" class="file-name-display small text-truncate" style="max-width: 170px;">
                  ${hasValidUpload 
                    ? `<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="bi bi-file-check me-1"></i>${uploaded.name} (${uploaded.size})</span>` 
                    : '<span class="text-muted fst-italic">No file chosen</span>'}
                </span>
              </div>
              <div class="invalid-feedback small" id="fileFeedback_${docKey}">Action Required: Attach valid .pdf document.</div>
            </div>

            <!-- 3. Expiration Date Picker -->
            <div class="col-lg-3 col-md-6">
              <label for="expiryDate_${docKey}" class="form-label small fw-semibold">
                Expiration Date <span class="text-danger">*</span>
              </label>
              <input type="date" 
                     class="form-control form-control-sm doc-expiry-input" 
                     id="expiryDate_${docKey}" 
                     name="expiry_${docKey}" 
                     data-doc-key="${docKey}"
                     value="${uploaded ? (uploaded.expiryDate || '') : ''}"
                     min="${minDate}"
                     ${doc.mandatory ? 'required' : ''}>
              <div class="invalid-feedback small">Action Required: Select future expiration date.</div>
            </div>

          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.doc-file-input').forEach(input => {
      input.addEventListener('change', handleDocumentUpload);
    });

    container.querySelectorAll('.doc-expiry-input').forEach(input => {
      input.addEventListener('change', handleExpiryDateChange);
      input.addEventListener('input', handleExpiryDateChange);
    });
  }

  function handleDocumentUpload(e) {
    const input = e.target;
    const docKey = input.getAttribute('data-doc-key') || input.getAttribute('data-doc-id');
    const file = input.files[0];
    const nameDisplay = document.getElementById(`fileNameDisplay_${docKey}`);

    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      input.value = '';
      input.classList.add('is-invalid');
      input.classList.remove('is-valid');
      if (nameDisplay) {
        nameDisplay.innerHTML = '<span class="text-danger small"><i class="bi bi-x-circle me-1"></i>Invalid (.pdf only)</span>';
      }
      showErrorToast('Invalid file format. Only PDF documents (.pdf) are permitted.', 'Format Error');
      updateDocRowStatusIcon(docKey);
      recalculateProgress();
      return;
    }

    input.classList.remove('is-invalid');
    input.classList.add('is-valid');

    const sizeKb = (file.size / 1024).toFixed(1) + ' KB';
    state.form.uploadedDocuments[docKey] = state.form.uploadedDocuments[docKey] || {};
    state.form.uploadedDocuments[docKey].name = file.name;
    state.form.uploadedDocuments[docKey].size = sizeKb;
    state.form.uploadedDocuments[docKey].type = 'application/pdf';
    state.form.uploadedDocuments[docKey].uploadDate = new Date().toISOString();

    if (nameDisplay) {
      nameDisplay.innerHTML = `<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="bi bi-file-check me-1"></i>${file.name} (${sizeKb})</span>`;
    }

    updateDocRowStatusIcon(docKey);
    recalculateProgress();

    window.dispatchEvent(new CustomEvent('vendor:document-uploaded', {
      detail: { docKey: docKey, metadata: state.form.uploadedDocuments[docKey] }
    }));
  }

  function handleExpiryDateChange(e) {
    const input = e.target;
    const docKey = input.getAttribute('data-doc-key') || input.getAttribute('data-doc-id');
    const expiryVal = input.value ? input.value.trim() : '';

    if (!docKey) return;

    state.form.uploadedDocuments[docKey] = state.form.uploadedDocuments[docKey] || {};
    state.form.uploadedDocuments[docKey].expiryDate = expiryVal;

    if (!expiryVal) {
      input.classList.remove('is-valid');
      if (input.required) {
        input.setCustomValidity('Must be a valid future expiration date.');
        input.classList.add('is-invalid');
      } else {
        input.setCustomValidity('');
        input.classList.remove('is-invalid');
      }
      updateDocRowStatusIcon(docKey);
      recalculateProgress();
      return;
    }

    const isExpired = isDateExpired(expiryVal);
    if (isExpired) {
      input.setCustomValidity('Must be a valid future expiration date.');
      input.classList.add('is-invalid');
      input.classList.remove('is-valid');
      showErrorToast(`Expiration date cannot be in the past (${expiryVal}).`, 'Date Constraint');
    } else {
      input.setCustomValidity('');
      input.classList.remove('is-invalid');
      input.classList.add('is-valid');
    }

    // Synchronize to LocalDB if active vendor exists
    const curUser = (window.PortalAuth && typeof window.PortalAuth.getCurrentUser === 'function') 
      ? window.PortalAuth.getCurrentUser() 
      : null;
    if (curUser && window.LocalDB) {
      const vendor = window.LocalDB.getVendorByUserId(curUser.uid);
      if (vendor && vendor.docs) {
        const d = vendor.docs.find(item => item.docId === docKey);
        if (d) {
          d.expDate = expiryVal;
          window.LocalDB.saveVendor(vendor);
        }
      }
    }

    updateDocRowStatusIcon(docKey);
    recalculateProgress();
  }

  function updateDocRowStatusIcon(docKey) {
    const iconContainer = document.getElementById(`validIcon_${docKey}`);
    const row = document.getElementById(`docRow_${docKey}`);
    const docData = state.form.uploadedDocuments[docKey];

    const hasFile = docData && docData.name;
    const hasExpiry = docData && docData.expiryDate;
    const isExpired = hasExpiry ? isDateExpired(docData.expiryDate) : false;

    if (hasFile && hasExpiry && !isExpired) {
      if (iconContainer) iconContainer.innerHTML = '<i class="bi bi-check-circle-fill text-success fs-5" title="Document Valid"></i>';
      if (row) {
        row.classList.add('is-uploaded');
        row.classList.remove('is-expired');
      }
    } else if (isExpired) {
      if (iconContainer) iconContainer.innerHTML = '<i class="bi bi-exclamation-circle-fill text-danger fs-5" title="Document Expired"></i>';
      if (row) {
        row.classList.remove('is-uploaded');
        row.classList.add('is-expired');
      }
    } else {
      if (iconContainer) iconContainer.innerHTML = '<i class="bi bi-dash-circle text-muted fs-5" title="Document Incomplete"></i>';
      if (row) {
        row.classList.remove('is-uploaded');
        row.classList.remove('is-expired');
      }
    }
  }

  function bindEinVerification() {
    const verifyBtn = document.getElementById('btnVerifyEin');
    const einInput = document.getElementById('vendorEin');
    const spinner = document.getElementById('einSpinner');
    const statusBadge = document.getElementById('einStatusBadge');

    if (!verifyBtn || !einInput) return;

    verifyBtn.addEventListener('click', () => {
      const einVal = einInput.value.trim();
      const einRegex = /^(\d{2}-?\d{7})$/;

      if (!einRegex.test(einVal)) {
        einInput.classList.add('is-invalid');
        einInput.focus();
        showErrorToast('Action Required: Enter a valid 9-digit US Federal EIN (format: XX-XXXXXXX).', 'Validation Warning');
        return;
      }

      einInput.classList.remove('is-invalid');
      einInput.classList.add('is-valid');

      verifyBtn.disabled = true;
      if (spinner) spinner.classList.remove('d-none');
      if (statusBadge) statusBadge.className = 'd-none';

      const verifyPromise = new Promise((resolve) => {
        setTimeout(() => {
          resolve({ valid: true, businessStatus: 'Active / Good Standing', registry: 'IRS BMF Federal Registry' });
        }, 1200);
      });

      verifyPromise.then(res => {
        verifyBtn.disabled = false;
        if (spinner) spinner.classList.add('d-none');
        state.form.isEinVerified = true;

        if (statusBadge) {
          statusBadge.className = 'badge bg-success-subtle text-success border border-success-subtle py-1 px-2 mt-1 d-inline-block';
          statusBadge.innerHTML = '<i class="bi bi-patch-check-fill text-success me-1"></i> Verified Active (IRS BMF)';
        }

        showSuccessToast('Federal EIN verified active against IRS Business Master File.', 'EIN Confirmed');
        recalculateProgress();

        window.dispatchEvent(new CustomEvent('vendor:ein-verified', {
          detail: { ein: einVal, verificationResult: res }
        }));
      });
    });
  }

  function bindRealTimeProgressListeners() {
    const fields = ['vendorLegalName', 'vendorEmail', 'vendorEin', 'vendorCategory', 'certifyAgreement', 'signatoryName'];
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', recalculateProgress);
        el.addEventListener('change', recalculateProgress);
      }
    });
  }

  function recalculateProgress() {
    const progressBar = document.getElementById('onboardingProgressBar');
    const stepProgressBar = document.getElementById('stepperNavProgressBar');
    const progressPercentLabel = document.getElementById('progressPercentLabel');
    if (!progressBar) return;

    let points = 0;

    const nameVal = document.getElementById('vendorLegalName')?.value.trim();
    const emailVal = document.getElementById('vendorEmail')?.value.trim();
    const einVal = document.getElementById('vendorEin')?.value.trim();

    if (nameVal) points += 10;
    if (emailVal && emailVal.includes('@')) points += 10;
    if (einVal) points += 5;
    if (state.form.isEinVerified) points += 10;

    let reqs = [];
    const schema = (window.LocalDB && typeof window.LocalDB.getRequirementSchema === 'function')
      ? window.LocalDB.getRequirementSchema()
      : null;
    if (schema && schema.customDocumentTypes && schema.customDocumentTypes.length > 0) {
      reqs = schema.customDocumentTypes;
    } else {
      reqs = state.complianceRequirements[state.form.selectedCategory] || [];
    }

    if (reqs.length > 0) {
      const pointsPerDoc = 40 / reqs.length;
      reqs.forEach(req => {
        const doc = state.form.uploadedDocuments[req.id];
        if (doc && doc.name && doc.expiryDate && !isDateExpired(doc.expiryDate)) {
          points += pointsPerDoc;
        }
      });
    }

    const certified = document.getElementById('certifyAgreement')?.checked;
    const signatory = document.getElementById('signatoryName')?.value.trim();

    if (certified) points += 15;
    if (signatory) points += 10;

    const percentage = Math.min(100, Math.round(points));

    progressBar.style.width = `${percentage}%`;
    progressBar.textContent = `${percentage}% Completed`;
    progressBar.setAttribute('aria-valuenow', percentage);

    if (progressPercentLabel) {
      progressPercentLabel.textContent = `${percentage}% Completed`;
    }

    if (percentage === 100) {
      progressBar.className = 'progress-bar bg-success progress-bar-striped';
    } else {
      progressBar.className = 'progress-bar bg-primary progress-bar-striped progress-bar-animated';
    }

    if (stepProgressBar) {
      const stepPercent = Math.round(((state.form.currentStep - 1) / (state.form.totalSteps - 1)) * 100);
      stepProgressBar.style.width = `${stepPercent}%`;
    }
  }

  function bindStepperButtons() {
    const btnNext = document.getElementById('btnFormNext');
    const btnPrev = document.getElementById('btnFormPrev');
    const btnSubmit = document.getElementById('btnFormSubmit');

    if (btnNext) {
      btnNext.addEventListener('click', () => {
        if (validateCurrentStep()) {
          setStep(state.form.currentStep + 1);
        }
      });
    }

    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        setStep(state.form.currentStep - 1);
      });
    }

    if (btnSubmit) {
      btnSubmit.addEventListener('click', handleFormFinalSubmission);
    }
  }

  function validateCurrentStep() {
    const currentPane = document.getElementById(`stepPane_${state.form.currentStep}`);
    if (!currentPane) return true;

    const form = document.getElementById('vendorOnboardingForm');
    let isValid = true;

    const inputs = currentPane.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      // Expiry inputs are validated by the dedicated expiration validator below
      if (input.classList.contains('doc-expiry-input')) return;

      if (!input.checkValidity()) {
        input.classList.add('is-invalid');
        isValid = false;
      } else {
        input.classList.remove('is-invalid');
      }
    });

    if (state.form.currentStep === 1) {
      const einInput = document.getElementById('vendorEin');
      if (einInput && !einInput.value.trim()) {
        einInput.classList.add('is-invalid');
        isValid = false;
      }
    }

    if (state.form.currentStep === 2) {
      let requirements = [];
      const schema = (window.LocalDB && typeof window.LocalDB.getRequirementSchema === 'function') 
        ? window.LocalDB.getRequirementSchema() 
        : null;
      if (schema && schema.customDocumentTypes && schema.customDocumentTypes.length > 0) {
        requirements = schema.customDocumentTypes;
      } else {
        requirements = state.complianceRequirements[state.form.selectedCategory] || state.complianceRequirements['Logistics / Freight'] || [];
      }

      const curUser = (window.PortalAuth && typeof window.PortalAuth.getCurrentUser === 'function')
        ? window.PortalAuth.getCurrentUser()
        : null;
      const vendorRecord = (curUser && window.LocalDB) ? window.LocalDB.getVendorByUserId(curUser.uid) : null;
      const vendorDocs = vendorRecord && vendorRecord.docs ? vendorRecord.docs : [];

      for (const req of requirements) {
        const reqId = req.id;
        const fileInput = document.getElementById(`fileInput_${reqId}`);
        const expiryInput = document.getElementById(`expiryDate_${reqId}`);
        const docData = state.form.uploadedDocuments[reqId] || {};
        const savedDoc = vendorDocs.find(d => d.docId === reqId);

        // Check if file is present
        const hasFile = (docData && docData.name) || 
                        (fileInput && fileInput.files && fileInput.files.length > 0) || 
                        (savedDoc && savedDoc.docName);

        if (req.mandatory && !hasFile) {
          isValid = false;
          if (fileInput) {
            fileInput.classList.add('is-invalid');
            fileInput.classList.remove('is-valid');
          }
        } else if (fileInput && hasFile) {
          fileInput.classList.remove('is-invalid');
          fileInput.classList.add('is-valid');
        }

        // Check expiration date
        const expVal = (expiryInput && expiryInput.value) 
          ? expiryInput.value.trim() 
          : (docData.expiryDate || (savedDoc ? savedDoc.expDate : ''));

        if (expiryInput) {
          if (expVal) {
            const expired = isDateExpired(expVal);
            if (expired) {
              isValid = false;
              expiryInput.setCustomValidity('Must be a valid future expiration date.');
              expiryInput.classList.add('is-invalid');
              expiryInput.classList.remove('is-valid');
            } else {
              expiryInput.setCustomValidity('');
              expiryInput.classList.remove('is-invalid');
              expiryInput.classList.add('is-valid');
              state.form.uploadedDocuments[reqId] = state.form.uploadedDocuments[reqId] || {};
              state.form.uploadedDocuments[reqId].expiryDate = expVal;
            }
          } else if (req.mandatory) {
            isValid = false;
            expiryInput.setCustomValidity('Must be a valid future expiration date.');
            expiryInput.classList.add('is-invalid');
            expiryInput.classList.remove('is-valid');
          } else {
            expiryInput.setCustomValidity('');
            expiryInput.classList.remove('is-invalid');
          }
        }
      }

      // Also validate any other rendered expiry inputs on currentPane
      const renderedExpiryInputs = currentPane.querySelectorAll('.doc-expiry-input');
      renderedExpiryInputs.forEach(expInput => {
        const docId = expInput.getAttribute('data-doc-id') || expInput.getAttribute('data-doc-key');
        const val = expInput.value ? expInput.value.trim() : '';
        if (val) {
          if (isDateExpired(val)) {
            isValid = false;
            expInput.setCustomValidity('Must be a valid future expiration date.');
            expInput.classList.add('is-invalid');
            expInput.classList.remove('is-valid');
          } else {
            expInput.setCustomValidity('');
            expInput.classList.remove('is-invalid');
            expInput.classList.add('is-valid');
            if (docId) {
              state.form.uploadedDocuments[docId] = state.form.uploadedDocuments[docId] || {};
              state.form.uploadedDocuments[docId].expiryDate = val;
            }
          }
        } else if (expInput.required) {
          isValid = false;
          expInput.setCustomValidity('Must be a valid future expiration date.');
          expInput.classList.add('is-invalid');
          expInput.classList.remove('is-valid');
        } else {
          expInput.setCustomValidity('');
          expInput.classList.remove('is-invalid');
        }
      });

      if (!isValid) {
        showErrorToast('Action Required: Attach all mandatory PDF compliance documents with valid future expiration dates.', 'Incomplete Documentation');
      }
    }

    if (!isValid && form) {
      form.classList.add('was-validated');
      showErrorToast('Please correct the highlighted fields before proceeding.', 'Form Incomplete');
    }

    return isValid;
  }

  /**
   * Sample UI Rendering Function: setStep(stepNumber)
   * Advances or rewinds the multi-step onboarding wizard
   * @param {number} stepNumber 
   */
  function setStep(stepNumber) {
    if (stepNumber < 1 || stepNumber > state.form.totalSteps) return;

    state.form.currentStep = stepNumber;
    updateStepperUI();
    recalculateProgress();

    if (stepNumber === 3) {
      renderReviewSummary();
    }

    const wizardCard = document.getElementById('vendorWizardCard');
    if (wizardCard) {
      wizardCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function updateStepperUI() {
    const cur = state.form.currentStep;
    const total = state.form.totalSteps;

    for (let i = 1; i <= total; i++) {
      const item = document.getElementById(`stepperItem_${i}`);
      const pane = document.getElementById(`stepPane_${i}`);

      if (item) {
        item.classList.remove('active', 'completed');
        if (i < cur) {
          item.classList.add('completed');
          const circle = item.querySelector('.stepper-circle');
          if (circle) circle.innerHTML = '<i class="bi bi-check-lg"></i>';
        } else if (i === cur) {
          item.classList.add('active');
          const circle = item.querySelector('.stepper-circle');
          if (circle) circle.textContent = i;
        } else {
          const circle = item.querySelector('.stepper-circle');
          if (circle) circle.textContent = i;
        }
      }

      if (pane) {
        pane.classList.toggle('active', i === cur);
      }
    }

    const btnPrev = document.getElementById('btnFormPrev');
    const btnNext = document.getElementById('btnFormNext');
    const btnSubmit = document.getElementById('btnFormSubmit');

    if (btnPrev) btnPrev.classList.toggle('d-none', cur === 1);
    if (btnNext) btnNext.classList.toggle('d-none', cur === total);
    if (btnSubmit) btnSubmit.classList.toggle('d-none', cur !== total);
  }

  function renderReviewSummary() {
    const container = document.getElementById('reviewSummaryContainer');
    if (!container) return;

    const legalName = document.getElementById('vendorLegalName')?.value || 'N/A';
    const dba = document.getElementById('vendorDba')?.value || 'N/A';
    const ein = document.getElementById('vendorEin')?.value || 'N/A';
    const email = document.getElementById('vendorEmail')?.value || 'N/A';
    const phone = document.getElementById('vendorPhone')?.value || 'N/A';
    const address = document.getElementById('vendorAddress')?.value || 'N/A';

    const docs = state.form.uploadedDocuments;
    const docKeys = Object.keys(docs);

    let docsListHtml = '';
    if (docKeys.length === 0) {
      docsListHtml = '<div class="text-danger small">No compliance documents attached.</div>';
    } else {
      docsListHtml = '<ul class="list-group list-group-flush small">';
      docKeys.forEach(k => {
        const d = docs[k];
        docsListHtml += `
          <li class="list-group-item px-0 py-2 d-flex justify-content-between align-items-center bg-transparent">
            <div>
              <i class="bi bi-file-earmark-pdf-fill text-danger me-1"></i>
              <strong>${d.name}</strong> (${d.size})
            </div>
            <span class="badge bg-light text-dark border">Expires: ${d.expiryDate || 'N/A'}</span>
          </li>
        `;
      });
      docsListHtml += '</ul>';
    }

    container.innerHTML = `
      <div class="card bg-light border-0 p-3 mb-3">
        <h6 class="fw-bold text-dark border-bottom pb-2 mb-3">
          <i class="bi bi-building text-primary me-2"></i> Step 1 Profile Summary
        </h6>
        <div class="row g-2 small">
          <div class="col-md-6"><strong>Company Legal Name:</strong> ${legalName}</div>
          <div class="col-md-6"><strong>Trade Name / DBA:</strong> ${dba}</div>
          <div class="col-md-6"><strong>Federal EIN / Tax ID:</strong> ${ein} ${state.form.isEinVerified ? '<span class="text-success fw-bold">(Verified Active)</span>' : ''}</div>
          <div class="col-md-6"><strong>Category:</strong> ${state.form.selectedCategory}</div>
          <div class="col-md-6"><strong>Compliance Contact:</strong> ${email}</div>
          <div class="col-md-6"><strong>Phone:</strong> ${phone}</div>
          <div class="col-12"><strong>Physical Address:</strong> ${address}</div>
        </div>
      </div>

      <div class="card bg-light border-0 p-3 mb-3">
        <h6 class="fw-bold text-dark border-bottom pb-2 mb-3">
          <i class="bi bi-files text-primary me-2"></i> Step 2 Compliance Document Stack (${docKeys.length} Files Attached)
        </h6>
        ${docsListHtml}
      </div>
    `;
  }

  function handleFormFinalSubmission(e) {
    if (e) e.preventDefault();

    const certCheckbox = document.getElementById('certifyAgreement');
    const signerInput = document.getElementById('signatoryName');

    if (!certCheckbox || !certCheckbox.checked) {
      showErrorToast('Action Required: You must certify the regulatory compliance declaration before submitting.', 'Attestation Required');
      if (certCheckbox) certCheckbox.focus();
      return;
    }

    if (!signerInput || !signerInput.value.trim()) {
      showErrorToast('Action Required: Enter authorized legal signatory name.', 'Signatory Required');
      if (signerInput) {
        signerInput.classList.add('is-invalid');
        signerInput.focus();
      }
      return;
    }

    const vendorPayload = {
      id: 'VEN-' + Math.floor(1000 + Math.random() * 9000),
      name: document.getElementById('vendorLegalName')?.value.trim() || 'New Vendor LLC',
      dba: document.getElementById('vendorDba')?.value.trim() || '',
      category: state.form.selectedCategory,
      ein: document.getElementById('vendorEin')?.value.trim() || '',
      email: document.getElementById('vendorEmail')?.value.trim() || '',
      phone: document.getElementById('vendorPhone')?.value.trim() || '',
      address: document.getElementById('vendorAddress')?.value.trim() || '',
      signatory: signerInput.value.trim(),
      submissionDate: new Date().toISOString(),
      status: 'Pending Review',
      tier: 'Tier 2',
      docs: Object.keys(state.form.uploadedDocuments).map(key => ({
        docId: key,
        docName: state.form.uploadedDocuments[key].name,
        size: state.form.uploadedDocuments[key].size,
        expDate: state.form.uploadedDocuments[key].expiryDate,
        docStatus: 'Pending Review'
      }))
    };

    window.dispatchEvent(new CustomEvent('vendor:form-submit', {
      detail: vendorPayload
    }));

    showSuccessToast(
      `Vendor onboarding dossier for ${vendorPayload.name} submitted successfully. Compliance status: Pending Review.`,
      'Submission Received'
    );

    const statusTabBtn = document.getElementById('tabVendorStatusBtn');
    if (statusTabBtn) statusTabBtn.click();

    updateVendorStatusTracker(vendorPayload);
  }

  function updateVendorStatusTracker(vendor) {
    const trackerContainer = document.getElementById('vendorStatusCard');
    if (!trackerContainer) return;

    let docRowsHtml = '';
    (vendor.docs || []).forEach(d => {
      const isExpired = isDateExpired(d.expDate);
      let docBadge = `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">${d.docStatus || 'Under Review'}</span>`;
      if (d.docStatus === 'Approved') {
        docBadge = `<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="bi bi-check-circle-fill me-1"></i> Approved</span>`;
      } else if (d.docStatus === 'Revision Requested' || isExpired) {
        docBadge = `<span class="badge bg-danger-subtle text-danger border border-danger-subtle"><i class="bi bi-exclamation-triangle-fill me-1"></i> ${isExpired ? 'Expired' : 'Revision Requested'}</span>`;
      }

      docRowsHtml += `
        <li class="list-group-item d-flex justify-content-between align-items-center py-3">
          <div>
            <i class="bi bi-file-earmark-check text-primary me-2 fs-5"></i>
            <span class="fw-semibold text-dark">${d.docName || d.docTitle || 'Certification File'}</span>
            <div class="text-muted small">Expires: <strong class="${isExpired ? 'text-danger' : 'text-dark'}">${d.expDate || 'N/A'}</strong></div>
          </div>
          <div>${docBadge}</div>
        </li>
      `;
    });

    if (!docRowsHtml) {
      docRowsHtml = '<li class="list-group-item text-muted small py-3 text-center">No compliance documents attached yet. Complete the onboarding wizard to submit your certifications.</li>';
    }

    let statusBadgeHtml = '<span class="status-badge status-badge-pending"><i class="bi bi-hourglass-split"></i> Pending Review</span>';
    let alertBannerHtml = `
      <div class="alert alert-warning border border-warning-subtle d-flex align-items-center gap-3 mb-4">
        <i class="bi bi-clock-history fs-3 text-warning"></i>
        <div>
          <div class="fw-bold">Procurement Review in Progress</div>
          <div class="small">Your documents are under compliance review. Estimated turnaround time is 1-2 business days.</div>
        </div>
      </div>
    `;

    if (vendor.status === 'Approved') {
      statusBadgeHtml = '<span class="status-badge status-badge-approved"><i class="bi bi-check-circle-fill"></i> Approved</span>';
      alertBannerHtml = `
        <div class="alert alert-success border border-success-subtle d-flex align-items-center gap-3 mb-4">
          <i class="bi bi-patch-check-fill fs-3 text-success"></i>
          <div>
            <div class="fw-bold">Compliance Status: Fully Verified &amp; Active</div>
            <div class="small">Your vendor compliance certification has been fully approved by Procurement Management. No further action is required.</div>
          </div>
        </div>
      `;
    } else if (vendor.status === 'Blocked') {
      statusBadgeHtml = '<span class="status-badge status-badge-blocked"><i class="bi bi-shield-x"></i> Blocked</span>';
      alertBannerHtml = `
        <div class="alert alert-danger border border-danger-subtle d-flex align-items-center gap-3 mb-4">
          <i class="bi bi-exclamation-octagon-fill fs-3 text-danger"></i>
          <div>
            <div class="fw-bold">Action Required: Compliance Escalation</div>
            <div class="small">${vendor.rejectionReason || 'Your compliance dossier contains expired certifications or requires administrative revision.'}</div>
          </div>
        </div>
      `;
    }

    trackerContainer.innerHTML = `
      <div class="card-body p-4">
        <div class="d-flex justify-content-between align-items-start mb-4">
          <div>
            <span class="badge bg-primary text-white mb-2">${vendor.id || 'VEN-PENDING'}</span>
            <h4 class="fw-bold text-dark mb-1">${vendor.name || 'Vendor Organization'}</h4>
            <div class="text-muted small"><i class="bi bi-tag-fill me-1"></i> ${vendor.category || 'General'} • Submitted: ${vendor.submissionDate ? new Date(vendor.submissionDate).toLocaleDateString() : 'Active Session'}</div>
          </div>
          ${statusBadgeHtml}
        </div>

        ${alertBannerHtml}

        <h6 class="fw-bold text-dark mb-3"><i class="bi bi-stack me-1 text-primary"></i> Submitted Compliance Documentation Stack</h6>
        <ul class="list-group mb-4">
          ${docRowsHtml}
        </ul>

        <div class="text-end">
          <button type="button" class="btn btn-outline-secondary btn-sm" onclick="document.getElementById('tabVendorWizardBtn').click()">
            <i class="bi bi-pencil-square me-1"></i> Update Information
          </button>
        </div>
      </div>
    `;
  }

  /* ==========================================================================
     5. MANAGER VENDORDATATABLE COMPONENT & ADMIN CONTROLS
     ========================================================================== */
  function bindManagerTableControls() {
    bindSearchInput();
    bindFilterDropdowns();
    bindExpiringFilterWidget();
    bindSortableHeaders();
  }

  /**
   * Sample UI Rendering Function: renderVendorTable(vendors)
   * Feeds master vendor records into the manager data table & mobile cards
   * @param {Array<object>} vendors 
   */
  function renderVendorTable(vendors) {
    if (!Array.isArray(vendors)) return;
    state.table.allVendors = [...vendors];
    applyFiltersAndSort();
  }

  function bindSearchInput() {
    const searchInput = document.getElementById('vendorSearchInput');
    const clearBtn = document.getElementById('btnClearSearch');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.table.searchQuery = e.target.value.toLowerCase().trim();
        state.table.currentPage = 1;
        applyFiltersAndSort();

        if (clearBtn) {
          clearBtn.classList.toggle('d-none', state.table.searchQuery === '');
        }

        window.dispatchEvent(new CustomEvent('vendor:search', {
          detail: { query: state.table.searchQuery }
        }));
      });
    }

    if (clearBtn && searchInput) {
      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        state.table.searchQuery = '';
        clearBtn.classList.add('d-none');
        applyFiltersAndSort();
      });
    }
  }

  function bindFilterDropdowns() {
    const statusSelect = document.getElementById('filterStatus');
    const tierSelect = document.getElementById('filterRiskTier');
    const categorySelect = document.getElementById('filterCategory');
    const btnReset = document.getElementById('btnResetFilters');

    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        state.table.statusFilter = e.target.value;
        state.table.currentPage = 1;
        applyFiltersAndSort();
        dispatchFilterEvent();
      });
    }

    if (tierSelect) {
      tierSelect.addEventListener('change', (e) => {
        state.table.riskTierFilter = e.target.value;
        state.table.currentPage = 1;
        applyFiltersAndSort();
        dispatchFilterEvent();
      });
    }

    if (categorySelect) {
      categorySelect.addEventListener('change', (e) => {
        state.table.categoryFilter = e.target.value;
        state.table.currentPage = 1;
        applyFiltersAndSort();
        dispatchFilterEvent();
      });
    }

    if (btnReset) {
      btnReset.addEventListener('click', () => {
        resetAllFilters();
      });
    }
  }

  function bindExpiringFilterWidget() {
    const widgetButtons = document.querySelectorAll('[data-expiring-filter]');
    widgetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        widgetButtons.forEach(b => {
          b.classList.remove('active', 'btn-portal-primary');
          b.classList.add('btn-portal-secondary');
        });

        btn.classList.remove('btn-portal-secondary');
        btn.classList.add('active', 'btn-portal-primary');

        state.table.expiringDaysFilter = btn.getAttribute('data-expiring-filter');
        state.table.currentPage = 1;
        applyFiltersAndSort();
        dispatchFilterEvent();
      });
    });
  }

  function bindSortableHeaders() {
    const headers = document.querySelectorAll('.table-portal th.sortable');
    headers.forEach(th => {
      th.addEventListener('click', () => {
        const field = th.getAttribute('data-sort');
        if (!field) return;

        if (state.table.sortField === field) {
          state.table.sortDirection = state.table.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          state.table.sortField = field;
          state.table.sortDirection = 'asc';
        }

        headers.forEach(h => {
          const icon = h.querySelector('i');
          if (icon) icon.className = 'bi bi-arrow-down-up text-muted ms-1 small';
        });

        const activeIcon = th.querySelector('i');
        if (activeIcon) {
          activeIcon.className = state.table.sortDirection === 'asc' 
            ? 'bi bi-sort-up text-primary ms-1 small' 
            : 'bi bi-sort-down text-primary ms-1 small';
        }

        applyFiltersAndSort();

        window.dispatchEvent(new CustomEvent('vendor:sort', {
          detail: { field: state.table.sortField, direction: state.table.sortDirection }
        }));
      });
    });
  }

  function resetAllFilters() {
    state.table.searchQuery = '';
    state.table.statusFilter = 'all';
    state.table.riskTierFilter = 'all';
    state.table.categoryFilter = 'all';
    state.table.expiringDaysFilter = 'all';
    state.table.currentPage = 1;

    const searchInput = document.getElementById('vendorSearchInput');
    const clearBtn = document.getElementById('btnClearSearch');
    const statusSelect = document.getElementById('filterStatus');
    const tierSelect = document.getElementById('filterRiskTier');
    const categorySelect = document.getElementById('filterCategory');

    if (searchInput) searchInput.value = '';
    if (clearBtn) clearBtn.classList.add('d-none');
    if (statusSelect) statusSelect.value = 'all';
    if (tierSelect) tierSelect.value = 'all';
    if (categorySelect) categorySelect.value = 'all';

    const widgetButtons = document.querySelectorAll('[data-expiring-filter]');
    widgetButtons.forEach(btn => {
      if (btn.getAttribute('data-expiring-filter') === 'all') {
        btn.classList.add('active', 'btn-portal-primary');
        btn.classList.remove('btn-portal-secondary');
      } else {
        btn.classList.remove('active', 'btn-portal-primary');
        btn.classList.add('btn-portal-secondary');
      }
    });

    applyFiltersAndSort();
    showToast('All search criteria and filters have been reset.', 'info', 'Filters Reset');
  }

  function dispatchFilterEvent() {
    window.dispatchEvent(new CustomEvent('vendor:filter-change', {
      detail: {
        status: state.table.statusFilter,
        tier: state.table.riskTierFilter,
        category: state.table.categoryFilter,
        expiringDays: state.table.expiringDaysFilter,
        searchQuery: state.table.searchQuery
      }
    }));
  }

  function applyFiltersAndSort() {
    let list = [...state.table.allVendors];

    if (state.table.searchQuery) {
      const q = state.table.searchQuery;
      list = list.filter(v => 
        (v.name && v.name.toLowerCase().includes(q)) ||
        (v.dba && v.dba.toLowerCase().includes(q)) ||
        (v.id && v.id.toLowerCase().includes(q)) ||
        (v.email && v.email.toLowerCase().includes(q)) ||
        (v.category && v.category.toLowerCase().includes(q))
      );
    }

    if (state.table.statusFilter !== 'all') {
      const target = state.table.statusFilter;
      list = list.filter(v => {
        if (target === 'Approved') return v.status === 'Approved' || v.status === 'Compliant';
        if (target === 'Pending') return v.status === 'Pending' || v.status === 'Pending Review' || v.status === 'Under Review';
        if (target === 'Blocked') return v.status === 'Blocked' || v.status === 'Expired' || v.status === 'Action Required';
        return v.status === target;
      });
    }

    if (state.table.riskTierFilter !== 'all') {
      list = list.filter(v => v.tier === state.table.riskTierFilter);
    }

    if (state.table.categoryFilter !== 'all') {
      list = list.filter(v => v.category === state.table.categoryFilter);
    }

    if (state.table.expiringDaysFilter !== 'all') {
      const days = parseInt(state.table.expiringDaysFilter, 10);
      const now = new Date().getTime();
      const targetWindowMs = days * 24 * 60 * 60 * 1000;

      list = list.filter(v => {
        if (!v.docs || !v.docs.length) return false;
        return v.docs.some(doc => {
          if (!doc.expDate) return false;
          const expTime = new Date(doc.expDate).getTime();
          const diffMs = expTime - now;
          return diffMs > 0 && diffMs <= targetWindowMs;
        });
      });
    }

    list.sort((a, b) => {
      let valA = '';
      let valB = '';

      if (state.table.sortField === 'name') {
        valA = a.name || '';
        valB = b.name || '';
      } else if (state.table.sortField === 'category') {
        valA = a.category || '';
        valB = b.category || '';
      } else if (state.table.sortField === 'submissionDate') {
        valA = a.submissionDate || '';
        valB = b.submissionDate || '';
      } else if (state.table.sortField === 'expiryDate') {
        valA = getEarliestExpiryDateRaw(a.docs);
        valB = getEarliestExpiryDateRaw(b.docs);
      } else if (state.table.sortField === 'tier') {
        valA = a.tier || '';
        valB = b.tier || '';
      } else if (state.table.sortField === 'status') {
        valA = a.status || '';
        valB = b.status || '';
      }

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return state.table.sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return state.table.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    state.table.filteredVendors = list;
    checkTier1AlertBanner(list);
    renderGridDOM();
  }

  function getEarliestExpiryDateRaw(docs) {
    if (!docs || !docs.length) return '9999-99-99';
    let minDate = '9999-99-99';
    docs.forEach(d => {
      if (d.expDate && d.expDate < minDate) {
        minDate = d.expDate;
      }
    });
    return minDate;
  }

  function checkTier1AlertBanner(vendors) {
    const banner = document.getElementById('tier1RiskAlertBanner');
    const bannerCount = document.getElementById('tier1RiskCount');
    if (!banner) return;

    const criticalVendors = state.table.allVendors.filter(v => v.tier === 'Tier 1' || v.status === 'Blocked');
    if (criticalVendors.length > 0) {
      banner.classList.remove('d-none');
      if (bannerCount) bannerCount.textContent = criticalVendors.length;
    } else {
      banner.classList.add('d-none');
    }
  }

  function renderGridDOM() {
    const tableBody = document.getElementById('vendorTableBody');
    const mobileContainer = document.getElementById('vendorCardsContainer');
    const emptyState = document.getElementById('vendorEmptyState');
    const totalCountBadge = document.getElementById('vendorFilteredCount');

    if (totalCountBadge) {
      totalCountBadge.textContent = `${state.table.filteredVendors.length} Records`;
    }

    if (state.table.filteredVendors.length === 0) {
      if (tableBody) tableBody.innerHTML = '';
      if (mobileContainer) mobileContainer.innerHTML = '';
      if (emptyState) emptyState.classList.remove('d-none');
      renderPagination(0);
      return;
    }

    if (emptyState) emptyState.classList.add('d-none');

    const startIndex = (state.table.currentPage - 1) * state.table.pageSize;
    const paginatedItems = state.table.filteredVendors.slice(startIndex, startIndex + state.table.pageSize);

    // 1. Render Desktop Table Rows (7 Sortable Columns)
    if (tableBody) {
      let tableRowsHtml = '';
      paginatedItems.forEach(vendor => {
        tableRowsHtml += generateTableRowHtml(vendor);
      });
      tableBody.innerHTML = tableRowsHtml;
    }

    // 2. Render Mobile Stacked Cards
    if (mobileContainer) {
      let cardsHtml = '';
      paginatedItems.forEach(vendor => {
        cardsHtml += generateMobileCardHtml(vendor);
      });
      mobileContainer.innerHTML = cardsHtml;
    }

    bindActionButtons();
    renderPagination(state.table.filteredVendors.length);
  }

  function generateTableRowHtml(vendor) {
    const statusPill = renderStatusBadgeHtml(vendor.status);
    const tierPill = renderTierBadgeHtml(vendor.tier);
    const expInfo = calculateEarliestExpiryInfo(vendor.docs);
    const subDate = vendor.submissionDate 
      ? new Date(vendor.submissionDate).toISOString().split('T')[0] 
      : 'N/A';

    return `
      <tr data-vendor-id="${vendor.id}">
        <!-- 1. Company Name -->
        <td>
          <div class="fw-bold text-dark">${vendor.name}</div>
          <div class="text-muted small">${vendor.id} ${vendor.dba ? '• DBA: ' + vendor.dba : ''}</div>
        </td>

        <!-- 2. Category -->
        <td>
          <span class="badge bg-light text-dark border">${vendor.category || 'Standard'}</span>
        </td>

        <!-- 3. Submission Date -->
        <td>
          <span class="small text-muted"><i class="bi bi-calendar3 me-1"></i>${subDate}</span>
        </td>

        <!-- 4. Expiration Date -->
        <td>
          <div class="small fw-medium">${expInfo.text}</div>
          <div class="small text-muted">${expInfo.subtext}</div>
        </td>

        <!-- 5. Risk Tier -->
        <td>
          ${tierPill}
        </td>

        <!-- 6. Status Badge -->
        <td>
          ${statusPill}
        </td>

        <!-- 7. Actions -->
        <td class="text-end">
          <div class="btn-group btn-group-sm" role="group" aria-label="Vendor Actions">
            <button type="button" 
                    class="btn btn-portal-primary btn-sm btn-review-vendor" 
                    data-action="review" 
                    data-vendor-id="${vendor.id}"
                    aria-label="Review compliance profile for ${vendor.name}">
              <i class="bi bi-file-earmark-check me-1"></i> Review
            </button>
            <button type="button" 
                    class="btn btn-outline-secondary btn-sm btn-audit-vendor" 
                    data-action="audit" 
                    data-vendor-id="${vendor.id}"
                    aria-label="View audit trail for ${vendor.name}">
              <i class="bi bi-clock-history"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  function generateMobileCardHtml(vendor) {
    const statusPill = renderStatusBadgeHtml(vendor.status);
    const tierPill = renderTierBadgeHtml(vendor.tier);
    const expInfo = calculateEarliestExpiryInfo(vendor.docs);
    const subDate = vendor.submissionDate 
      ? new Date(vendor.submissionDate).toISOString().split('T')[0] 
      : 'N/A';

    return `
      <div class="vendor-card-mobile" data-vendor-id="${vendor.id}">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <div>
            <div class="fw-bold text-dark fs-6">${vendor.name}</div>
            <div class="text-muted small">${vendor.id} • ${vendor.category}</div>
          </div>
          <div>${statusPill}</div>
        </div>

        <div class="card-field-row">
          <span class="card-field-label">Risk Rating:</span>
          <span>${tierPill}</span>
        </div>

        <div class="card-field-row">
          <span class="card-field-label">Submission Date:</span>
          <span class="small text-muted"><i class="bi bi-calendar3 me-1"></i>${subDate}</span>
        </div>

        <div class="card-field-row">
          <span class="card-field-label">Doc Expiration:</span>
          <span class="small fw-medium">${expInfo.text}</span>
        </div>

        <div class="card-field-row">
          <span class="card-field-label">Contact Email:</span>
          <span class="small text-muted">${vendor.email || 'N/A'}</span>
        </div>

        <div class="mt-3 d-grid gap-2 d-flex">
          <button type="button" 
                  class="btn btn-portal-primary btn-sm flex-grow-1 btn-review-vendor" 
                  data-action="review" 
                  data-vendor-id="${vendor.id}">
            <i class="bi bi-file-earmark-check me-1"></i> Review Dossier
          </button>
          <button type="button" 
                  class="btn btn-outline-secondary btn-sm btn-audit-vendor" 
                  data-action="audit" 
                  data-vendor-id="${vendor.id}">
            <i class="bi bi-clock-history"></i>
          </button>
        </div>
      </div>
    `;
  }

  function renderStatusBadgeHtml(status) {
    switch (status) {
      case 'Compliant':
      case 'Approved':
        return '<span class="status-badge status-badge-approved"><i class="bi bi-check-circle-fill"></i> Approved</span>';
      case 'Pending Review':
      case 'Under Review':
      case 'Pending':
        return '<span class="status-badge status-badge-pending"><i class="bi bi-hourglass-split"></i> Pending Review</span>';
      case 'Blocked':
      case 'Expired':
      case 'Action Required':
      default:
        return '<span class="status-badge status-badge-blocked"><i class="bi bi-shield-x"></i> Blocked</span>';
    }
  }

  function renderTierBadgeHtml(tier) {
    switch (tier) {
      case 'Tier 1':
        return '<span class="tier-badge tier-badge-1"><i class="bi bi-exclamation-triangle-fill"></i> Tier 1 - High Risk</span>';
      case 'Tier 2':
        return '<span class="tier-badge tier-badge-2"><i class="bi bi-shield-exclamation"></i> Tier 2 - Medium</span>';
      case 'Tier 3':
      default:
        return '<span class="tier-badge tier-badge-3"><i class="bi bi-shield-check"></i> Tier 3 - Low</span>';
    }
  }

  function calculateEarliestExpiryInfo(docs) {
    if (!docs || !docs.length) {
      return { text: 'No docs attached', subtext: 'Upload pending' };
    }

    const now = new Date().getTime();
    let minDays = Infinity;
    let earliestDate = null;
    let expiredCount = 0;

    docs.forEach(d => {
      if (!d.expDate) return;
      const expTime = new Date(d.expDate).getTime();
      const diffDays = Math.ceil((expTime - now) / (1000 * 60 * 60 * 24));
      if (diffDays < minDays) {
        minDays = diffDays;
        earliestDate = d.expDate;
      }
      if (diffDays <= 0) {
        expiredCount++;
      }
    });

    if (expiredCount > 0) {
      return {
        text: `<span class="text-danger fw-bold"><i class="bi bi-x-circle-fill"></i> ${expiredCount} Expired</span>`,
        subtext: 'Conservative cascade: Blocked'
      };
    }

    if (minDays === Infinity) {
      return { text: 'Verified Active', subtext: 'No expiring dates' };
    }

    if (minDays <= 30) {
      return {
        text: `<span class="text-warning-emphasis fw-bold"><i class="bi bi-clock"></i> In ${minDays} Days</span>`,
        subtext: `Expires: ${earliestDate}`
      };
    }

    return {
      text: `<span class="text-success"><i class="bi bi-check2"></i> In ${minDays} Days</span>`,
      subtext: `Expires: ${earliestDate}`
    };
  }

  function bindActionButtons() {
    document.querySelectorAll('.btn-review-vendor').forEach(btn => {
      btn.addEventListener('click', () => {
        const vendorId = btn.getAttribute('data-vendor-id');
        const vendor = state.table.allVendors.find(v => v.id === vendorId);
        if (vendor) {
          openReviewModal(vendorId, vendor);
        }
      });
    });

    document.querySelectorAll('.btn-audit-vendor').forEach(btn => {
      btn.addEventListener('click', () => {
        const vendorId = btn.getAttribute('data-vendor-id');
        const vendor = state.table.allVendors.find(v => v.id === vendorId);
        if (vendor) {
          openAuditModal(vendorId, vendor);
        }
      });
    });
  }

  function renderPagination(totalItems) {
    const container = document.getElementById('tablePagination');
    if (!container) return;

    const totalPages = Math.ceil(totalItems / state.table.pageSize) || 1;
    const cur = state.table.currentPage;

    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    let pagesHtml = `
      <ul class="pagination pagination-sm mb-0">
        <li class="page-item ${cur === 1 ? 'disabled' : ''}">
          <button type="button" class="page-link" data-page="${cur - 1}" aria-label="Previous Page">
            <span aria-hidden="true">&laquo;</span>
          </button>
        </li>
    `;

    for (let p = 1; p <= totalPages; p++) {
      pagesHtml += `
        <li class="page-item ${p === cur ? 'active' : ''}">
          <button type="button" class="page-link" data-page="${p}">${p}</button>
        </li>
      `;
    }

    pagesHtml += `
        <li class="page-item ${cur === totalPages ? 'disabled' : ''}">
          <button type="button" class="page-link" data-page="${cur + 1}" aria-label="Next Page">
            <span aria-hidden="true">&raquo;</span>
          </button>
        </li>
      </ul>
    `;

    container.innerHTML = pagesHtml;

    container.querySelectorAll('.page-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetPage = parseInt(btn.getAttribute('data-page'), 10);
        if (targetPage >= 1 && targetPage <= totalPages) {
          state.table.currentPage = targetPage;
          renderGridDOM();
        }
      });
    });
  }

  /**
   * KPI Metric Summary Cards Updater
   * Total Onboarded, Compliant Vendors, Expiring Documents (< 30/60/90 days), Blocked Vendors
   * @param {object} kpiData { total, compliant, pending, expiringSoon, blocked }
   */
  function updateKPIs(kpiData) {
    if (!kpiData) return;

    const elTotal = document.getElementById('kpiTotalVendors');
    const elCompliant = document.getElementById('kpiCompliant');
    const elExpiring = document.getElementById('kpiExpiringSoon');
    const elBlocked = document.getElementById('kpiBlocked');

    if (elTotal && kpiData.total !== undefined) elTotal.textContent = kpiData.total;
    if (elCompliant && kpiData.compliant !== undefined) elCompliant.textContent = kpiData.compliant;
    if (elExpiring && kpiData.expiringSoon !== undefined) elExpiring.textContent = kpiData.expiringSoon;
    if (elBlocked && kpiData.blocked !== undefined) elBlocked.textContent = kpiData.blocked;
  }

  /* ==========================================================================
     6. REVIEW MODAL, REJECTION VALIDATION & AUDIT LOGS
     ========================================================================== */
  function openReviewModal(vendorId, vendor) {
    if (!vendor) return;
    currentReviewVendor = vendor;

    const modalEl = document.getElementById('vendorReviewModal');
    if (!modalEl) return;

    const rejectSection = document.getElementById('reviewRejectionSection');
    const rejectText = document.getElementById('reviewRejectionReason');
    if (rejectSection) rejectSection.classList.add('d-none');
    if (rejectText) {
      rejectText.value = '';
      rejectText.classList.remove('is-invalid');
    }

    const titleEl = document.getElementById('reviewModalVendorName');
    const idEl = document.getElementById('reviewModalVendorId');
    const catEl = document.getElementById('reviewModalCategory');
    const tierEl = document.getElementById('reviewModalRiskTier');
    const einEl = document.getElementById('reviewModalEin');
    const contactEl = document.getElementById('reviewModalContact');
    const termsEl = document.getElementById('reviewModalTerms');

    if (titleEl) titleEl.textContent = vendor.name || 'Vendor Dossier';
    if (idEl) idEl.textContent = vendor.id || 'N/A';
    if (catEl) catEl.textContent = vendor.category || 'Standard';
    if (einEl) einEl.textContent = vendor.ein || 'N/A';
    if (contactEl) contactEl.textContent = `${vendor.email || ''} ${vendor.phone ? '• ' + vendor.phone : ''}`;
    if (termsEl) termsEl.textContent = vendor.email || 'N/A';

    if (tierEl) {
      tierEl.innerHTML = renderTierBadgeHtml(vendor.tier);
    }

    const docsContainer = document.getElementById('reviewModalDocsList');
    if (docsContainer) {
      const docs = vendor.docs || [];
      if (docs.length === 0) {
        docsContainer.innerHTML = '<div class="alert alert-warning small">No compliance documents attached to this dossier.</div>';
      } else {
        let html = '';
        docs.forEach((doc, idx) => {
          const isExpired = isDateExpired(doc.expDate);
          const validityBadge = isExpired
            ? '<span class="badge bg-danger-subtle text-danger border border-danger-subtle"><i class="bi bi-x-circle me-1"></i> Expired</span>'
            : '<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="bi bi-check-circle me-1"></i> Valid</span>';

          const docStatus = doc.docStatus || 'Pending Review';
          let docStatusBadge = '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">Under Review</span>';
          if (docStatus === 'Approved') {
            docStatusBadge = '<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="bi bi-check-lg me-1"></i> Accepted</span>';
          } else if (docStatus === 'Revision Requested') {
            docStatusBadge = '<span class="badge bg-danger-subtle text-danger border border-danger-subtle"><i class="bi bi-arrow-repeat me-1"></i> Revision Requested</span>';
          }

          html += `
            <div class="border rounded p-3 mb-2 bg-light d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2" id="reviewDocRow_${doc.docId || idx}">
              <div class="d-flex align-items-start gap-2">
                <i class="bi bi-file-earmark-pdf-fill text-danger fs-4 flex-shrink-0"></i>
                <div>
                  <div class="fw-semibold text-dark" style="font-size:0.9rem;">${doc.docName || doc.docTitle || 'Compliance File'}</div>
                  <div class="text-muted small">
                    Expiration Date: <strong class="${isExpired ? 'text-danger' : 'text-dark'}">${doc.expDate || 'N/A'}</strong> 
                    ${isExpired ? '<span class="text-danger fw-bold ms-1">(Action Required: Expired)</span>' : ''}
                  </div>
                </div>
              </div>
              <div class="d-flex align-items-center gap-2 flex-wrap flex-shrink-0">
                ${validityBadge}
                <span class="doc-status-slot" id="docStatusSlot_${doc.docId || idx}">${docStatusBadge}</span>
                <div class="btn-group btn-group-sm">
                  <button type="button" 
                          class="btn btn-outline-secondary btn-view-doc" 
                          data-doc-name="${doc.docName || doc.docTitle}" 
                          data-doc-exp="${doc.expDate || 'N/A'}"
                          data-vendor="${vendor.name}"
                          title="Preview Certified Document">
                    <i class="bi bi-eye"></i>
                  </button>
                  <button type="button" 
                          class="btn btn-outline-success btn-doc-accept" 
                          data-doc-id="${doc.docId || idx}"
                          title="Accept Document">
                    <i class="bi bi-check-lg"></i> Accept
                  </button>
                  <button type="button" 
                          class="btn btn-outline-warning text-dark btn-doc-revision" 
                          data-doc-id="${doc.docId || idx}"
                          title="Request Re-upload / Revision">
                    <i class="bi bi-arrow-repeat"></i> Revise
                  </button>
                </div>
              </div>
            </div>
          `;
        });
        docsContainer.innerHTML = html;

        docsContainer.querySelectorAll('.btn-view-doc').forEach(btn => {
          btn.addEventListener('click', () => {
            const docName = btn.getAttribute('data-doc-name');
            const docExp = btn.getAttribute('data-doc-exp');
            const vName = btn.getAttribute('data-vendor');
            openDocPreview(docName, docExp, vName);
          });
        });

        // 3-State Mutation: Accept Document
        docsContainer.querySelectorAll('.btn-doc-accept').forEach(btn => {
          btn.addEventListener('click', () => {
            const dId = btn.getAttribute('data-doc-id');
            const doc = (vendor.docs || []).find(d => String(d.docId || '') === dId || String(docs.indexOf(d)) === dId);
            if (doc) {
              doc.docStatus = 'Approved';
              if (window.LocalDB) {
                window.LocalDB.updateVendor(vendor.id, { docs: vendor.docs });
                window.LocalDB.addAuditLog(
                  'Procurement Manager',
                  'manager',
                  `Approved Document Certification: ${doc.docName}`,
                  vendor.id
                );
              }
              const slot = document.getElementById(`docStatusSlot_${dId}`);
              if (slot) {
                slot.innerHTML = '<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="bi bi-check-lg me-1"></i> Accepted</span>';
              }
              showSuccessToast(`Certification "${doc.docName}" approved.`, 'Document Accepted');
            }
          });
        });

        // 3-State Mutation: Request Re-upload / Revision
        docsContainer.querySelectorAll('.btn-doc-revision').forEach(btn => {
          btn.addEventListener('click', () => {
            const dId = btn.getAttribute('data-doc-id');
            const doc = (vendor.docs || []).find(d => String(d.docId || '') === dId || String(docs.indexOf(d)) === dId);
            if (doc) {
              doc.docStatus = 'Revision Requested';
              if (window.LocalDB) {
                window.LocalDB.updateVendor(vendor.id, { docs: vendor.docs, status: 'Pending Review' });
                window.LocalDB.addAuditLog(
                  'Procurement Manager',
                  'manager',
                  `Requested Document Revision / Re-upload: ${doc.docName}`,
                  vendor.id
                );
              }
              const slot = document.getElementById(`docStatusSlot_${dId}`);
              if (slot) {
                slot.innerHTML = '<span class="badge bg-danger-subtle text-danger border border-danger-subtle"><i class="bi bi-arrow-repeat me-1"></i> Revision Requested</span>';
              }
              showToast(`Revision requested for "${doc.docName}". Vendor notified.`, 'warning', 'Revision Requested');
            }
          });
        });
      }
    }

    const bsModal = new bootstrap.Modal(modalEl);
    bsModal.show();
  }

  function bindReviewModalActions() {
    const btnApprove = document.getElementById('btnReviewApprove');
    const btnRejectToggle = document.getElementById('btnReviewRejectToggle');
    const btnConfirmReject = document.getElementById('btnConfirmReject');
    const btnCancelReject = document.getElementById('btnCancelReject');
    const rejectSection = document.getElementById('reviewRejectionSection');
    const rejectInput = document.getElementById('reviewRejectionReason');

    if (btnApprove) {
      btnApprove.addEventListener('click', () => {
        if (!currentReviewVendor) return;

        const hasExpired = (currentReviewVendor.docs || []).some(d => isDateExpired(d.expDate));
        if (hasExpired) {
          const confirmOverride = confirm('Warning: This vendor contains 1 or more expired documents. System policy dictates a conservative Blocked status. Do you wish to override and approve?');
          if (!confirmOverride) return;
        }

        const approvePayload = {
          vendorId: currentReviewVendor.id,
          vendorName: currentReviewVendor.name,
          decision: 'Approved',
          status: 'Approved',
          timestamp: new Date().toISOString(),
          managerRole: 'Procurement Manager'
        };

        window.dispatchEvent(new CustomEvent('vendor:approve', {
          detail: approvePayload
        }));

        closeReviewModal();
        showSuccessToast(
          `Vendor ${currentReviewVendor.name} (${currentReviewVendor.id}) approved. Compliance status: Approved.`,
          'Vendor Approved'
        );
      });
    }

    if (btnRejectToggle && rejectSection) {
      btnRejectToggle.addEventListener('click', () => {
        rejectSection.classList.remove('d-none');
        if (rejectInput) rejectInput.focus();
      });
    }

    if (btnCancelReject && rejectSection) {
      btnCancelReject.addEventListener('click', () => {
        rejectSection.classList.add('d-none');
        if (rejectInput) {
          rejectInput.value = '';
          rejectInput.classList.remove('is-invalid');
        }
      });
    }

    if (btnConfirmReject && rejectInput) {
      btnConfirmReject.addEventListener('click', () => {
        const reason = rejectInput.value.trim();
        if (!reason) {
          rejectInput.classList.add('is-invalid');
          rejectInput.focus();
          showErrorToast('Action Required: Provide a descriptive rejection reason.', 'Reason Mandatory');
          return;
        }

        rejectInput.classList.remove('is-invalid');

        const rejectPayload = {
          vendorId: currentReviewVendor.id,
          vendorName: currentReviewVendor.name,
          decision: 'Rejected',
          status: 'Blocked',
          rejectionReason: reason,
          timestamp: new Date().toISOString(),
          managerRole: 'Procurement Manager'
        };

        window.dispatchEvent(new CustomEvent('vendor:reject', {
          detail: rejectPayload
        }));

        closeReviewModal();
        showToast(
          `Vendor ${currentReviewVendor.name} rejected. Formal notice recorded with reason: "${reason}".`,
          'warning',
          'Dossier Rejected'
        );
      });
    }
  }

  function closeReviewModal() {
    const modalEl = document.getElementById('vendorReviewModal');
    if (modalEl) {
      const bsModal = bootstrap.Modal.getInstance(modalEl);
      if (bsModal) bsModal.hide();
    }
    currentReviewVendor = null;
  }

  function openAuditModal(vendorId, vendor) {
    const modalEl = document.getElementById('auditTrailModal');
    if (!modalEl) return;

    const vendorNameEl = document.getElementById('auditModalVendorName');
    const timelineContainer = document.getElementById('auditModalTimeline');

    if (vendorNameEl) {
      vendorNameEl.textContent = vendor ? `${vendor.name} (${vendor.id})` : 'System Audit Trail';
    }

    const logs = (vendor && vendor.auditLogs) || generateMockAuditLogs(vendor);

    if (timelineContainer) {
      let html = '<ul class="timeline-list">';
      logs.forEach(log => {
        const isDanger = log.action.includes('Reject') || log.action.includes('Blocked') || log.action.includes('Expired');
        const isSuccess = log.action.includes('Approve') || log.action.includes('Verified') || log.action.includes('Compliant');
        const dotClass = isDanger ? 'dot-danger' : isSuccess ? 'dot-success' : '';

        html += `
          <li class="timeline-item ${dotClass}">
            <div class="timeline-dot"></div>
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span class="fw-bold text-dark small">${log.action}</span>
              <span class="text-muted small">${new Date(log.timestamp).toLocaleString()}</span>
            </div>
            <div class="text-secondary small mb-1">${log.details}</div>
            <div class="small text-muted"><i class="bi bi-person-fill"></i> Actor: <strong>${log.actor}</strong></div>
          </li>
        `;
      });
      html += '</ul>';
      timelineContainer.innerHTML = html;
    }

    const bsModal = new bootstrap.Modal(modalEl);
    bsModal.show();
  }

  function openDocPreview(docName, docExp, vendorName) {
    const modalEl = document.getElementById('documentPreviewModal');
    if (!modalEl) return;

    const docTitle = document.getElementById('docPreviewTitle');
    const docMeta = document.getElementById('docPreviewMeta');
    const docVendor = document.getElementById('docPreviewVendor');

    if (docTitle) docTitle.textContent = docName;
    if (docMeta) docMeta.textContent = `Expiration Date: ${docExp} • Quota-Safe Certified Stub`;
    if (docVendor) docVendor.textContent = `Vendor: ${vendorName}`;

    const bsModal = new bootstrap.Modal(modalEl);
    bsModal.show();
  }

  function generateMockAuditLogs(vendor) {
    const vName = vendor ? vendor.name : 'Vendor';
    return [
      {
        timestamp: new Date().toISOString(),
        action: 'Compliance Review Initiated',
        details: `Procurement dossier opened for inspection by procurement manager.`,
        actor: 'Procurement Manager'
      },
      {
        timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
        action: 'IRS EIN Identity Verified',
        details: `Automated EIN registry match confirmed against IRS BMF.`,
        actor: 'System Automated Pipeline'
      },
      {
        timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
        action: 'Onboarding Dossier Submitted',
        details: `Initial multi-step registration and document stack uploaded by ${vName}.`,
        actor: 'Vendor Authorized Signatory'
      }
    ];
  }

  /* ==========================================================================
     7. CHART.JS EXECUTIVE ANALYTICS (initCharts, updateCharts)
     ========================================================================== */
  /**
   * Initializes Chart.js executive analytics containers
   * 1. <canvas id="complianceStatusChart"></canvas>: Doughnut chart
   * 2. <canvas id="riskTierChart"></canvas>: Bar chart for Vendors by Risk Tier & Category
   */
  function initCharts() {
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js library not loaded. Skipping chart initialization.');
      return;
    }

    Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = '#64748B';

    initStatusDoughnutChart();
    initRiskTierBarChart();
  }

  function initStatusDoughnutChart() {
    const canvas = document.getElementById('complianceStatusChart');
    if (!canvas) return;

    if (statusChartInstance) {
      statusChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    statusChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Approved / Compliant', 'Pending Review', 'Blocked / Action Required'],
        datasets: [{
          data: [12, 5, 2],
          backgroundColor: ['#198754', '#FFC107', '#DC3545'],
          borderColor: '#FFFFFF',
          borderWidth: 2,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              padding: 16,
              usePointStyle: true,
              font: { weight: '500' }
            }
          },
          tooltip: {
            backgroundColor: '#0A2540',
            titleFont: { weight: 'bold' },
            padding: 10,
            cornerRadius: 6
          }
        }
      }
    });
  }

  function initRiskTierBarChart() {
    const canvas = document.getElementById('riskTierChart');
    if (!canvas) return;

    if (riskChartInstance) {
      riskChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    riskChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: [
          'Tier 1 (High)', 
          'Tier 2 (Med)', 
          'Tier 3 (Low)', 
          'Logistics', 
          'IT & Cloud', 
          'Manufacturing', 
          'Consulting'
        ],
        datasets: [{
          label: 'Registered Vendors',
          data: [2, 6, 11, 5, 6, 4, 4],
          backgroundColor: [
            'rgba(220, 53, 69, 0.88)',   // Tier 1: Red
            'rgba(255, 193, 7, 0.88)',   // Tier 2: Amber
            'rgba(25, 135, 84, 0.88)',   // Tier 3: Green
            'rgba(10, 37, 64, 0.88)',    // Logistics: Deep Navy
            'rgba(13, 46, 92, 0.88)',    // IT & Cloud: Navy Light
            'rgba(100, 116, 139, 0.88)', // Manufacturing: Slate
            'rgba(2, 132, 199, 0.88)'    // Consulting: Sky
          ],
          borderRadius: 6,
          maxBarThickness: 34
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 2,
              color: '#64748B'
            },
            grid: {
              color: '#F1F5F9'
            }
          },
          x: {
            ticks: {
              color: '#64748B',
              font: { size: 11 }
            },
            grid: {
              display: false
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: '#0A2540',
            padding: 10,
            cornerRadius: 6,
            callbacks: {
              label: function (context) {
                return ` ${context.parsed.y} Active Vendors`;
              }
            }
          }
        }
      }
    });
  }

  /**
   * Sample UI Rendering Function: updateCharts(chartData)
   * Primary interface hook for Abhinaba Das's .reduce() aggregated metrics
   * @param {object} chartData { statusData: [approved, pending, blocked], riskData: [t1, t2, t3, log, it, mfg, con] }
   */
  function updateCharts(chartData) {
    if (!chartData) return;

    if (statusChartInstance && chartData.statusData) {
      statusChartInstance.data.datasets[0].data = chartData.statusData;
      statusChartInstance.update();
    }

    if (riskChartInstance && chartData.riskData) {
      riskChartInstance.data.datasets[0].data = chartData.riskData;
      riskChartInstance.update();
    }
  }

  /* ==========================================================================
     8. EXPORT ACTION CONTROLS & EVENT INTEGRATION HOOKS
     ========================================================================== */
  function bindExportButtons() {
    const btnCsv = document.getElementById('btnExportCSV');
    const btnPdf = document.getElementById('btnExportPDF');

    // "Export to CSV" Control with Icon & Disabled/Loading State
    if (btnCsv) {
      btnCsv.addEventListener('click', () => {
        const currentData = state.table.filteredVendors.length 
          ? state.table.filteredVendors 
          : state.table.allVendors;

        const originalHtml = btnCsv.innerHTML;
        btnCsv.disabled = true;
        btnCsv.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Exporting CSV...';

        const exportEvent = new CustomEvent('vendor:export-csv', {
          cancelable: true,
          detail: {
            vendors: currentData,
            timestamp: new Date().toISOString(),
            filename: `Vendor_Compliance_Export_${new Date().toISOString().slice(0, 10)}.csv`
          }
        });

        const dispatched = window.dispatchEvent(exportEvent);

        setTimeout(() => {
          if (dispatched) {
            fallbackExportCSV(currentData);
          }
          btnCsv.disabled = false;
          btnCsv.innerHTML = originalHtml;
          showSuccessToast(`Generated CSV export file for ${currentData.length} vendor records.`, 'CSV Export Complete');
        }, 700);
      });
    }

    // "Export to PDF" Control with Icon & Disabled/Loading State
    if (btnPdf) {
      btnPdf.addEventListener('click', () => {
        const currentData = state.table.filteredVendors.length 
          ? state.table.filteredVendors 
          : state.table.allVendors;

        const originalHtml = btnPdf.innerHTML;
        btnPdf.disabled = true;
        btnPdf.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Generating PDF...';

        const pdfFilename = `Executive_Vendor_Dossier_${new Date().toISOString().slice(0, 10)}.pdf`;

        const pdfEvent = new CustomEvent('vendor:export-pdf', {
          cancelable: true,
          detail: {
            vendors: currentData,
            timestamp: new Date().toISOString(),
            filename: pdfFilename
          }
        });

        window.dispatchEvent(pdfEvent);

        setTimeout(() => {
          generateExecutivePDF(currentData, pdfFilename);
          btnPdf.disabled = false;
          btnPdf.innerHTML = originalHtml;
        }, 600);
      });
    }
  }

  function generateExecutivePDF(vendors, customFilename) {
    if (!vendors || !vendors.length) {
      showToast('No vendor records available to export.', 'warning', 'Export Empty');
      return;
    }

    const filename = customFilename || `Executive_Vendor_Dossier_${new Date().toISOString().slice(0, 10)}.pdf`;

    try {
      if (window.jspdf && (window.jspdf.jsPDF || window.jspdf)) {
        const jsPDFConstructor = window.jspdf.jsPDF || window.jspdf;
        const doc = new jsPDFConstructor({ orientation: 'landscape', unit: 'pt', format: 'letter' });

        // Navy banner
        doc.setFillColor(10, 37, 64);
        doc.rect(0, 0, doc.internal.pageSize.getWidth(), 55, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('TrustVendor | B2B Vendor Compliance Dossier Register', 40, 32);

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(203, 213, 225);
        doc.text(`Generated: ${new Date().toLocaleString()}  •  Total Records: ${vendors.length}  •  Compliance Vault Report`, 40, 46);

        const tableRows = vendors.map(v => [
          v.id || 'N/A',
          v.name || 'N/A',
          v.category || 'N/A',
          v.ein || 'N/A',
          v.status || 'Pending',
          v.tier || 'Tier 2',
          v.submissionDate ? new Date(v.submissionDate).toLocaleDateString() : 'N/A',
          (v.docs || []).length + ' certs'
        ]);

        if (typeof doc.autoTable === 'function') {
          doc.autoTable({
            startY: 70,
            head: [['Vendor ID', 'Company Name', 'Category', 'EIN / Tax ID', 'Status', 'Risk Tier', 'Submitted', 'Documents']],
            body: tableRows,
            theme: 'grid',
            headStyles: {
              fillColor: [30, 41, 59],
              textColor: [255, 255, 255],
              fontStyle: 'bold',
              fontSize: 8.5,
              cellPadding: 6
            },
            styles: {
              fontSize: 8,
              cellPadding: 5,
              textColor: [15, 23, 42]
            },
            alternateRowStyles: {
              fillColor: [248, 250, 252]
            },
            margin: { left: 40, right: 40 },
            didDrawPage: function () {
              const str = `Page ${doc.internal.getNumberOfPages()} • Confidential Compliance Report • TrustVendor Enterprise Platform`;
              doc.setFontSize(7.5);
              doc.setTextColor(148, 163, 184);
              doc.text(str, 40, doc.internal.pageSize.getHeight() - 15);
            }
          });
        }

        doc.save(filename);
        showSuccessToast(`Generated and downloaded executive PDF dossier (${vendors.length} vendor records).`, 'PDF Export Ready');
        return;
      }
    } catch (err) {
      console.warn('jsPDF generation failed, falling back to CSV export:', err);
    }

    fallbackExportCSV(vendors);
    showToast('Exported dataset to CSV format.', 'info', 'CSV Downloaded');
  }

  function fallbackExportCSV(vendors) {
    if (!vendors || !vendors.length) {
      showToast('No vendor records available to export.', 'warning', 'Export Empty');
      return;
    }

    const headers = ['Vendor ID', 'Company Name', 'DBA', 'Category', 'EIN', 'Status', 'Risk Tier', 'Email', 'Submission Date'];
    const rows = vendors.map(v => [
      `"${v.id || ''}"`,
      `"${(v.name || '').replace(/"/g, '""')}"`,
      `"${(v.dba || '').replace(/"/g, '""')}"`,
      `"${v.category || ''}"`,
      `"${v.ein || ''}"`,
      `"${v.status || ''}"`,
      `"${v.tier || ''}"`,
      `"${v.email || ''}"`,
      `"${v.submissionDate || ''}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', url);
    downloadAnchor.setAttribute('download', `Vendor_Compliance_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
    URL.revokeObjectURL(url);
  }

  function bindTeammateCustomEventConsumers() {
    window.addEventListener('vendor:form-submit', (e) => {
      const newVendor = e.detail;
      state.table.allVendors.unshift(newVendor);
      refreshUIWithVendors(state.table.allVendors);
    });

    window.addEventListener('vendor:approve', (e) => {
      const { vendorId } = e.detail;
      const target = state.table.allVendors.find(v => v.id === vendorId);
      if (target) {
        target.status = 'Approved';
        target.tier = 'Tier 3';
        (target.docs || []).forEach(d => {
          if (d.docStatus !== 'Expired') d.docStatus = 'Approved';
        });
      }
      refreshUIWithVendors(state.table.allVendors);
    });

    window.addEventListener('vendor:reject', (e) => {
      const { vendorId, rejectionReason } = e.detail;
      const target = state.table.allVendors.find(v => v.id === vendorId);
      if (target) {
        target.status = 'Blocked';
        target.tier = 'Tier 1';
        target.rejectionReason = rejectionReason;
      }
      refreshUIWithVendors(state.table.allVendors);
    });

    window.addEventListener('localdb:state-imported', () => {
      if (window.LocalDB && typeof window.LocalDB.getVendors === 'function') {
        state.table.allVendors = window.LocalDB.getVendors();
        refreshUIWithVendors(state.table.allVendors);
      }
    });
  }

  function refreshUIWithVendors(vendors) {
    renderVendorTable(vendors);

    let total = vendors.length;
    let compliant = 0;
    let pending = 0;
    let blocked = 0;
    let expiringSoon = 0;

    let tier1 = 0;
    let tier2 = 0;
    let tier3 = 0;

    let logCount = 0;
    let itCount = 0;
    let mfgCount = 0;
    let conCount = 0;

    const now = new Date().getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    vendors.forEach(v => {
      if (v.status === 'Approved' || v.status === 'Compliant') compliant++;
      else if (v.status === 'Pending Review' || v.status === 'Pending') pending++;
      else blocked++;

      if (v.tier === 'Tier 1') tier1++;
      else if (v.tier === 'Tier 2') tier2++;
      else tier3++;

      if (v.category === 'Logistics / Freight') logCount++;
      else if (v.category === 'IT / Cloud Services') itCount++;
      else if (v.category === 'Manufacturing / Raw Materials') mfgCount++;
      else if (v.category === 'Consulting / Professional Services') conCount++;

      const hasExpiring = (v.docs || []).some(d => {
        if (!d.expDate) return false;
        const diff = new Date(d.expDate).getTime() - now;
        return diff > 0 && diff <= thirtyDaysMs;
      });

      if (hasExpiring) expiringSoon++;
    });

    updateKPIs({
      total,
      compliant,
      pending,
      blocked,
      expiringSoon
    });

    updateCharts({
      statusData: [compliant, pending, blocked],
      riskData: [tier1, tier2, tier3, logCount, itCount, mfgCount, conCount]
    });
  }

  function seedInitialDemoData() {
    if (window.LocalDB && typeof window.LocalDB.getVendors === 'function') {
      const dbVendors = window.LocalDB.getVendors();
      if (dbVendors && dbVendors.length > 0) {
        state.table.allVendors = [...dbVendors];
        setTimeout(() => {
          refreshUIWithVendors(state.table.allVendors);
        }, 80);
        return;
      }
    }

    const initialSeedVendors = [
      {
        id: 'VEN-4821',
        name: 'Apex Global Logistics Inc.',
        dba: 'Apex Freightways',
        category: 'Logistics / Freight',
        ein: '12-3456789',
        email: 'compliance@apexlogistics.com',
        phone: '+1 (555) 234-5678',
        address: '1420 Freight Parkway, Chicago, IL 60607',
        status: 'Approved',
        tier: 'Tier 3',
        submissionDate: '2026-09-15T10:00:00.000Z',
        docs: [
          { docId: 'w9_form', docName: 'W9_Tax_Form_2026.pdf', size: '245.2 KB', expDate: '2027-01-01', docStatus: 'Approved' },
          { docId: 'cert_insurance', docName: 'COI_Carrier_Liability.pdf', size: '1.2 MB', expDate: '2026-12-15', docStatus: 'Approved' },
          { docId: 'dot_safety_rating', docName: 'DOT_Satisfactory_Rating.pdf', size: '480.0 KB', expDate: '2027-03-30', docStatus: 'Approved' }
        ]
      },
      {
        id: 'VEN-5912',
        name: 'CloudScale Technologies LLC',
        dba: 'CloudScale DevOps',
        category: 'IT / Cloud Services',
        ein: '98-7654321',
        email: 'legal@cloudscale.io',
        phone: '+1 (555) 876-5432',
        address: '400 Silicon Valley Way, San Jose, CA 95113',
        status: 'Pending Review',
        tier: 'Tier 2',
        submissionDate: '2026-10-18T14:30:00.000Z',
        docs: [
          { docId: 'w9_form', docName: 'IRS_W9_Signed.pdf', size: '310.5 KB', expDate: '2026-12-31', docStatus: 'Pending Review' },
          { docId: 'soc2_report', docName: 'SOC2_Type2_Report_2026.pdf', size: '3.4 MB', expDate: '2026-11-20', docStatus: 'Pending Review' },
          { docId: 'cert_insurance', docName: 'Cyber_Liability_2M.pdf', size: '1.1 MB', expDate: '2026-11-12', docStatus: 'Pending Review' }
        ]
      },
      {
        id: 'VEN-6204',
        name: 'Vanguard Industrial Supplies',
        dba: 'Vanguard Steel Works',
        category: 'Manufacturing / Raw Materials',
        ein: '45-6789123',
        email: 'vendor-desk@vanguard-ind.com',
        phone: '+1 (555) 456-7890',
        address: '880 Foundry Road, Cleveland, OH 44114',
        status: 'Blocked',
        tier: 'Tier 1',
        submissionDate: '2026-08-01T09:15:00.000Z',
        docs: [
          { docId: 'w9_form', docName: 'W9_Vanguard.pdf', size: '180.4 KB', expDate: '2026-09-01', docStatus: 'Expired' },
          { docId: 'iso9001_cert', docName: 'ISO9001_Certificate.pdf', size: '890.1 KB', expDate: '2027-06-30', docStatus: 'Approved' },
          { docId: 'cert_insurance', docName: 'General_Liability_COI.pdf', size: '520.3 KB', expDate: '2026-10-10', docStatus: 'Expired' }
        ]
      },
      {
        id: 'VEN-7108',
        name: 'Stratton & Cross Consulting LLP',
        dba: 'Stratton Cross Advisory',
        category: 'Consulting / Professional Services',
        ein: '33-4455667',
        email: 'contracts@strattoncross.com',
        phone: '+1 (555) 998-1122',
        address: '750 Lexington Ave, New York, NY 10022',
        status: 'Approved',
        tier: 'Tier 3',
        submissionDate: '2026-09-28T16:45:00.000Z',
        docs: [
          { docId: 'w9_form', docName: 'Stratton_W9_Signed.pdf', size: '290.0 KB', expDate: '2027-04-15', docStatus: 'Approved' },
          { docId: 'cert_insurance', docName: 'Errors_Omissions_COI.pdf', size: '1.4 MB', expDate: '2027-02-28', docStatus: 'Approved' },
          { docId: 'signed_nda', docName: 'Mutual_NDA_Executed.pdf', size: '640.8 KB', expDate: '2028-09-28', docStatus: 'Approved' }
        ]
      },
      {
        id: 'VEN-8349',
        name: 'Nordic Cold Chain Solutions',
        dba: 'Nordic Reefer Transport',
        category: 'Logistics / Freight',
        ein: '88-1122334',
        email: 'operations@nordic-cold.com',
        phone: '+1 (555) 334-9988',
        address: '500 Polar Way, Minneapolis, MN 55401',
        status: 'Pending Review',
        tier: 'Tier 2',
        submissionDate: '2026-10-21T11:20:00.000Z',
        docs: [
          { docId: 'w9_form', docName: 'W9_Nordic.pdf', size: '210.0 KB', expDate: '2027-01-31', docStatus: 'Pending Review' },
          { docId: 'cert_insurance', docName: 'Cargo_Reefer_Insurance.pdf', size: '2.1 MB', expDate: '2026-11-05', docStatus: 'Pending Review' },
          { docId: 'dot_safety_rating', docName: 'FMCSA_DOT_Rating.pdf', size: '390.4 KB', expDate: '2027-05-15', docStatus: 'Pending Review' }
        ]
      }
    ];

    setTimeout(() => {
      refreshUIWithVendors(initialSeedVendors);
    }, 100);
  }

  /* ==========================================================================
     9. TOAST NOTIFICATION HELPERS (showToast, showSuccessToast, showErrorToast)
     ========================================================================== */
  /**
   * Sample UI Helper Function: showToast(message, type, title)
   * Fixed floating container (.toast-container.position-fixed.top-0.end-0.p-3)
   * @param {string} message 
   * @param {'success'|'danger'|'warning'|'info'} type 
   * @param {string} [title='System Notification'] 
   */
  function showToast(message, type = 'info', title = 'System Notification') {
    const container = document.getElementById('portalToastContainer');
    if (!container) return;

    const toastId = 'toast_' + Date.now();
    let borderClass = 'toast-info';
    let iconClass = 'bi-info-circle-fill text-primary';

    if (type === 'success') {
      borderClass = 'toast-success';
      iconClass = 'bi-check-circle-fill text-success';
    } else if (type === 'danger') {
      borderClass = 'toast-danger';
      iconClass = 'bi-exclamation-octagon-fill text-danger';
    } else if (type === 'warning') {
      borderClass = 'toast-warning';
      iconClass = 'bi-exclamation-triangle-fill text-warning';
    }

    const toastHtml = `
      <div id="${toastId}" class="toast portal-toast ${borderClass} bg-white mb-2 shadow-lg" role="alert" aria-live="assertive" aria-atomic="true" data-bs-delay="4500">
        <div class="toast-header bg-white border-bottom-0 pb-1 pt-2">
          <i class="bi ${iconClass} me-2 fs-6"></i>
          <strong class="me-auto text-dark" style="font-size:0.875rem;">${title}</strong>
          <small class="text-muted">Just now</small>
          <button type="button" class="btn-close ms-2" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
        <div class="toast-body pt-1 pb-2 text-secondary" style="font-size:0.85rem;">
          ${message}
        </div>
      </div>
    `;

    container.insertAdjacentHTML('beforeend', toastHtml);
    const toastEl = document.getElementById(toastId);
    if (toastEl) {
      const bsToast = new bootstrap.Toast(toastEl);
      bsToast.show();
      toastEl.addEventListener('hidden.bs.toast', () => {
        toastEl.remove();
      });
    }
  }

  function showSuccessToast(message, title = 'Success Confirmed') {
    showToast(message, 'success', title);
  }

  function showErrorToast(message, title = 'Action Required / Error') {
    showToast(message, 'danger', title);
  }

  function getTodayDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function isDateExpired(dateStr) {
    if (!dateStr) return false;
    // Format YYYY-MM-DD
    const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      // Valid through 23:59:59.999 of the specified day in user's local timezone
      const expDate = new Date(year, month, day, 23, 59, 59, 999);
      return expDate.getTime() < Date.now();
    }
    const exp = new Date(dateStr).getTime();
    return !isNaN(exp) && exp < Date.now();
  }

  function setupA11yKeyboardTraps() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const openModal = document.querySelector('.modal.show');
        if (openModal) {
          const bsModal = bootstrap.Modal.getInstance(openModal);
          if (bsModal) bsModal.hide();
        }
      }
    });
  }

  /* ==========================================================================
     10. PUBLIC EXPORT HOOKS ON WINDOW.PORTALUI
     ========================================================================== */
  window.PortalUI.switchMainView = switchMainView;
  window.PortalUI.selectRole = selectRole;
  window.PortalUI.setInteractiveAuthRole = setInteractiveAuthRole;
  window.PortalUI.setStep = setStep;
  window.PortalUI.renderUploadRows = renderUploadRows;
  window.PortalUI.renderVendorTable = renderVendorTable;
  window.PortalUI.updateKPIs = updateKPIs;
  window.PortalUI.updateCharts = updateCharts;
  window.PortalUI.initCharts = initCharts;
  window.PortalUI.showToast = showToast;
  window.PortalUI.showSuccessToast = showSuccessToast;
  window.PortalUI.showErrorToast = showErrorToast;
  window.PortalUI.openReviewModal = openReviewModal;
  window.PortalUI.closeReviewModal = closeReviewModal;
  window.PortalUI.openAuditModal = openAuditModal;
  window.PortalUI.openDocPreview = openDocPreview;
  window.PortalUI.updateVendorStatusTracker = updateVendorStatusTracker;
  window.PortalUI.generateExecutivePDF = generateExecutivePDF;
  window.PortalUI.resetFilters = resetAllFilters;
  window.PortalUI.isDateExpired = isDateExpired;
  window.PortalUI.getTodayDateString = getTodayDateString;
  window.PortalUI.state = state;
  window.PortalUI.getRole = () => state.currentRole;
  window.PortalUI.getMainView = () => state.currentMainView;
  window.PortalUI.getAllVendors = () => state.table.allVendors;
  window.PortalUI.getFilteredVendors = () => state.table.filteredVendors;

  // Initialize on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window, document);
