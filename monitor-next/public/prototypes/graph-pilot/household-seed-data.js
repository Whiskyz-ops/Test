/* household-seed-data.js — Rohan & Priya Mehta's saved Layer 0/1 data,
 * exactly as router.html / layer1_india.html / layer1_us.html save it
 * (captured by opening each form on the original example data and letting
 * it save), so every value the Monitor and engine use is one a user can see
 * and change in the forms, and opening a form changes nothing.
 * Cleaned after capture: Rohan's s.44ADA election removed (the India form
 * doesn't allow it for a non-resident; the engine already ignored it), and
 * three fields no form collects (holding_pct, and the US property's type /
 * gross rent / expenses) dropped; India entries in the US foreign-tax
 * baskets dropped (with India data on file the engine takes the Indian tax
 * from the India side and ignores them); form timestamps removed.
 * Regenerate: see docs/HOUSEHOLD_DESIGN.md ("Example household data"). */
(function (root) {
  "use strict";
  var DATA = {
 "c_rohan_mehta": {
  "router": {
   "jurisdiction": "dual",
   "base_tax_year": 2026,
   "full_name": "Rohan Mehta",
   "date_of_birth": "1985-03-22",
   "is_us_citizen": false,
   "has_green_card": true,
   "us_days": 345,
   "has_us_source_income_or_assets": true
  },
  "india": {
   "global_quarter": "Q1",
   "itr_recommendation": {
    "form": "ITR-3",
    "explanation": "For Individuals and HUFs with Business or Professional Income maintaining books, or receiving remuneration/interest as a partner in a firm. Mandatory if disqualified from ITR-4."
   },
   "profile": {
    "full_name": "Rohan Mehta",
    "entity_type": "individual",
    "date_of_birth": "1985-03-22",
    "pan": "AAAPM5678Q",
    "pan_aadhaar_linked": true,
    "tax_regime": "NEW",
    "turnover_lte_400cr": false,
    "is_section_8": false,
    "mat_book_profit": null,
    "opt_115ba": false,
    "opt_115baa": false,
    "opt_115bab": false,
    "mfg_setup_date": null,
    "mfg_commence_date": null
   },
   "residency_detail": {
    "live_tracking_active": false,
    "trips": [
     {
      "arrival_date": null,
      "departure_date": null
     }
    ],
    "manual_days": 20,
    "india_work_days_current_year": null,
    "is_wholly_outside_india": null,
    "is_indian_company": null,
    "is_poem_in_india": null,
    "days_in_india_current_year": 20,
    "days_in_india_preceding_4_years_gte_365": null,
    "employment_or_crew_status": null,
    "is_departure_year": null,
    "ship_nationality": null,
    "came_on_visit_to_india_pio_citizen": null,
    "nr_years_last_10_gte_9": null,
    "days_in_india_last_7_years_lte_729": null,
    "india_source_income_above_15l": null,
    "liable_to_tax_in_another_country_being_indian_citizen": false,
    "final_india_residency_status": "NR",
    "dtaa_worldwide_ceded": false
   },
   "company_residency": {
    "is_active_business": false,
    "board_meetings_primarily_outside_india": false,
    "key_management_location": "",
    "management_delegated_outside_india": false,
    "directors_in_india_count": 0,
    "directors_outside_india_count": 0
   },
   "dtaa": {
    "tax_residency_country": "US",
    "is_us_resident_for_dtaa": true,
    "dtaa_treaty_residence": "US",
    "trc_status": false,
    "has_permanent_establishment_in_india": false,
    "treaty_elections": [
     {
      "income_type": "interest",
      "amount_inr": 150000,
      "elected_rate": 0.15,
      "treaty_article": "Art 11(2)(b)"
     },
     {
      "income_type": "royalty",
      "amount_inr": 400000,
      "elected_rate": 0.15,
      "treaty_article": "Art 12(2)(a)(ii)"
     }
    ],
    "mfn_clause_invoked": false,
    "dtaa_forced_nr": false,
    "form_10f": false
   },
   "compliance_docs": {
    "trc": {
     "validity_start_date": null,
     "validity_end_date": null,
     "document_uploaded": false
    },
    "form_10f": {
     "is_filed": false,
     "ack_number": null
    },
    "section_197_cert": {
     "is_available": false,
     "rate": null,
     "validity_start_date": null,
     "validity_end_date": null,
     "covered_income_types": null
    }
   },
   "bank_accounts": [
    {
     "bank_name": "SBI (NRO)",
     "account_type": "nro",
     "peak_balance_inr": 2600000
    },
    {
     "bank_name": "Axis (NRE)",
     "account_type": "nre",
     "peak_balance_inr": 1900000
    }
   ],
   "property": {
    "has_indian_property_transaction": true,
    "properties": [
     {
      "property_type": "residential",
      "status": "holding",
      "address": "Villa 4, Bengaluru",
      "pincode": null,
      "buyer_name": null,
      "buyer_pan": null,
      "acquisition_date": null,
      "actual_cost": null,
      "actual_cost_currency": "INR",
      "pre_2001_fmv_inr": null,
      "transfer_expenses_inr": null,
      "sale_date": null,
      "sale_consideration": null,
      "sale_consideration_currency": null,
      "stamp_duty_value": null,
      "stamp_duty_value_currency": "INR",
      "buyer_tan": null,
      "buyer_tds_deducted_inr": null,
      "buyer_tds_challan_number": null,
      "is_joint_property": false,
      "ownership_percentage": null,
      "is_inherited": false,
      "original_owner_acquisition_date": null,
      "original_owner_cost": null,
      "original_owner_cost_currency": null,
      "cg_exemption_section": null,
      "cg_exempt_invest_amount": null,
      "cg_exempt_invest_date": null,
      "cg_deposited_in_cgas": false,
      "improvements": [],
      "annual_value_inr": 840000,
      "gross_rent_received_inr": 1200000,
      "municipal_taxes_paid_inr": 60000
     }
    ]
   },
   "financial_holdings": {
    "has_financial_transactions": true,
    "transactions": [
     {
      "asset_class": "equity_mutual_fund",
      "asset_name_or_ticker": "SBI Bluechip Fund",
      "isin": null,
      "quantity": null,
      "acquisition_date": null,
      "purchase_value": 4200000,
      "purchase_currency": "INR",
      "fmv_31jan2018_per_unit_inr": null,
      "sale_date": null,
      "sale_value": null,
      "sale_currency": "INR",
      "stt_paid": true,
      "transfer_expenses": null,
      "is_specified_foreign_exchange_asset": false,
      "nri_exit_type": "redeemed_at_maturity",
      "investment_income_this_year": null,
      "asset_type": "equity_mutual_fund",
      "asset_name": "SBI Bluechip Fund",
      "value_inr": 4200000
     },
     {
      "asset_class": "equity_mutual_fund",
      "asset_name_or_ticker": "Mirae Asset Large Cap",
      "isin": null,
      "quantity": null,
      "acquisition_date": null,
      "purchase_value": 2600000,
      "purchase_currency": "INR",
      "fmv_31jan2018_per_unit_inr": null,
      "sale_date": null,
      "sale_value": null,
      "sale_currency": "INR",
      "stt_paid": true,
      "transfer_expenses": null,
      "is_specified_foreign_exchange_asset": false,
      "nri_exit_type": "redeemed_at_maturity",
      "investment_income_this_year": null,
      "asset_type": "equity_mutual_fund",
      "asset_name": "Mirae Asset Large Cap",
      "value_inr": 2600000
     },
     {
      "asset_class": "listed_equity",
      "asset_name_or_ticker": "HDFCBANK",
      "isin": null,
      "quantity": 800,
      "acquisition_date": "2025-12-01",
      "purchase_value": 1220000,
      "purchase_currency": "INR",
      "fmv_31jan2018_per_unit_inr": null,
      "sale_date": "2026-08-20",
      "sale_value": 1400000,
      "sale_currency": "INR",
      "stt_paid": true,
      "transfer_expenses": 0,
      "is_specified_foreign_exchange_asset": false,
      "nri_exit_type": "redeemed_at_maturity",
      "investment_income_this_year": null
     }
    ]
   },
   "commodities": {
    "has_commodity_transactions": false,
    "transactions": []
   },
   "unlisted_equity": {
    "has_unlisted_equity_transaction": false,
    "transactions": []
   },
   "share_buyback": {
    "has_buyback_transaction": false,
    "transactions": []
   },
   "domestic_income": {
    "salary": {
     "has_salary_income": false,
     "taxable_salary_inr": null,
     "gross_salary_inr": null,
     "work_performed_outside_india": null,
     "workdays_in_india": null,
     "workdays_outside_india": null,
     "pwd_transport_allowance": {
      "is_eligible_pwd": false,
      "allowance_received_inr": null
     },
     "conveyance_allowance": {
      "allowance_received_inr": null,
      "actual_expenditure_inr": null
     },
     "tour_travel_allowance": {
      "allowance_received_inr": null,
      "actual_expenditure_inr": null
     },
     "daily_allowance": {
      "allowance_received_inr": null,
      "actual_expenditure_inr": null
     },
     "hra_received_inr": null,
     "rent_paid_inr": null,
     "is_metro_city": false,
     "basic_da_inr": null,
     "lta_claimed_inr": null,
     "perquisites_inr": null,
     "esop_perquisite_inr": null,
     "esop_perquisite_events": [],
     "professional_tax_inr": null,
     "employer_nps_contribution_inr": null,
     "prior_employer_salary_inr": null
    },
    "house_property": {
     "has_house_property_income": true,
     "properties": [
      {
       "property_use": "LOP",
       "gross_annual_value_inr": 1200000,
       "municipal_taxes_paid_inr": 60000
      }
     ]
    },
    "business_income": {
     "has_business_or_fo_income": true,
     "entity_type": "individual",
     "nr_ineligible_presumptive": false,
     "nature_of_business": [
      "own_business"
     ],
     "business_code": null,
     "presumptive_scheme": [],
     "profession_type": null,
     "s115BAC_optout_history": false,
     "business_entries": [
      {
       "business_name": "Mehta Advisory Services",
       "nature": "consulting",
       "presumptive_scheme": null,
       "gross_receipts_inr": 1800000,
       "expenses": {
        "opening_stock_inr": null,
        "closing_stock_inr": null,
        "rent_for_business_premises_inr": null,
        "repairs_maintenance_inr": null,
        "insurance_premium_inr": null,
        "employee_salary_wages_inr": null,
        "employee_bonus_commission_inr": null,
        "employer_pf_esi_contribution_inr": null,
        "interest_on_borrowed_capital_inr": null,
        "bad_debts_written_off_inr": null,
        "other_business_expenses_inr": null,
        "has_related_party_payments": false,
        "payments_to_non_residents_no_tds_inr": null,
        "payments_to_residents_no_tds_inr": null,
        "total_cash_payments_exceeding_limit_inr": null,
        "cash_limit_type": "10k",
        "total_cash_payments_exceeding_35k_inr": null,
        "s35_own_revenue_research_inr": null,
        "s35_own_capital_research_inr": null,
        "s35_donation_to_approved_body_inr": null,
        "s35D_total_preliminary_expenses_inr": null,
        "s35D_year_of_commencement": null,
        "s35DDA_vrs_payments_inr": null,
        "s35DDA_first_year_of_payment": null,
        "stt_paid_inr": null,
        "ctt_paid_inr": null,
        "brokerage_on_fno_inr": null,
        "exchange_charges_inr": null,
        "advisory_and_data_subscriptions_inr": null,
        "internet_proportion_inr": null,
        "home_office_proportion_inr": null,
        "margin_interest_inr": null,
        "ca_professional_fees_inr": null,
        "employer_pf_esi_paid_before_due_date": null
       }
      },
      {
       "business_name": "Mehta Equipment Rentals",
       "nature": "equipment rental",
       "presumptive_scheme": null,
       "gross_receipts_inr": 2400000,
       "expenses": {
        "rent_for_business_premises_inr": 180000,
        "employee_salary_wages_inr": 300000,
        "other_business_expenses_inr": 120000,
        "payments_to_residents_no_tds_inr": 100000
       }
      }
     ],
     "s44AD_last_exit_ay": null,
     "s44AD_opted_current_year": false,
     "goods_vehicles": [],
     "opening_stock_inr": null,
     "closing_stock_inr": null,
     "gst_registration_status": "unregistered",
     "gst_collected_inr": null,
     "expenses": {
      "rent_for_business_premises_inr": null,
      "repairs_maintenance_inr": null,
      "employee_salary_wages_inr": null,
      "employee_bonus_commission_inr": null,
      "interest_on_borrowed_capital_inr": null,
      "insurance_premium_inr": null,
      "bad_debts_written_off_inr": null,
      "other_business_expenses_inr": null,
      "total_cash_payments_exceeding_limit_inr": null,
      "cash_limit_type": "10k",
      "total_cash_payments_exceeding_35k_inr": null,
      "has_related_party_payments": false,
      "payments_to_non_residents_no_tds_inr": null,
      "payments_to_residents_no_tds_inr": null,
      "s35_own_revenue_research_inr": null,
      "s35_own_capital_research_inr": null,
      "s35_donation_to_approved_body_inr": null,
      "s35D_total_preliminary_expenses_inr": null,
      "s35D_year_of_commencement": null,
      "s35DDA_vrs_payments_inr": null,
      "s35DDA_first_year_of_payment": null,
      "stt_paid_inr": null,
      "ctt_paid_inr": null,
      "brokerage_on_fno_inr": null,
      "exchange_charges_inr": null,
      "advisory_and_data_subscriptions_inr": null,
      "internet_proportion_inr": null,
      "home_office_proportion_inr": null,
      "margin_interest_inr": null,
      "ca_professional_fees_inr": null,
      "employer_pf_esi_contribution_inr": null,
      "employer_pf_esi_paid_before_due_date": null
     },
     "asset_blocks": [
      {
       "unit_biz_idx": 1,
       "unit_branch_idx": null,
       "asset_class": "plant_machinery_general",
       "opening_wdv_inr": 2000000,
       "additions_during_year_inr": 500000,
       "addition_date": "2026-06-01",
       "sale_consideration_inr": 0,
       "is_new_manufacturing_asset": false
      }
     ],
     "speculative_income_inr": -80000,
     "speculative_turnover_inr": 900000,
     "non_speculative_income_inr": 250000,
     "fno_turnover_inr": 4000000,
     "s41_remission_income_inr": null,
     "s41_bad_debt_recovery_inr": null,
     "partner_firms": [
      {
       "firm_name": "Kapoor & Mehta Consulting LLP",
       "entity_type": "llp",
       "remuneration_from_entity_inr": 600000,
       "interest_on_capital_from_entity_inr": 120000,
       "profit_share_exempt_inr": 900000
      }
     ],
     "msme_payables": [
      {
       "unit_biz_idx": 1,
       "unit_branch_idx": null,
       "supplier_name": "Precision Tools Co",
       "amount_inr": 50000,
       "invoice_date": "2026-01-01",
       "has_written_agreement": false,
       "payment_date": null
      }
     ],
     "amt_credit_bf_inr": null,
     "amt_credit_bf_origin_ay": null,
     "partner_remuneration_s40b_inr": null,
     "s44bbb_receipts_inr": null,
     "specified_business_s35AD_inr": null,
     "tonnage_tax_115V_inr": null,
     "has_business_income": true
    },
    "has_agricultural_income": false,
    "agricultural_income_inr": null,
    "capital_gains": {
     "short_term_15_pct": null
    },
    "other_sources": {
     "interest_inr": null
    },
    "has_salary": false,
    "has_house_property": true,
    "has_other_sources": true
   },
   "other_sources": {
    "has_other_sources_income": true,
    "quarters": {},
    "interest_savings_inr": null,
    "interest_fd_rd_inr": 260000,
    "interest_fd_rd_tds_inr": null,
    "interest_bonds_inr": null,
    "interest_bonds_tds_inr": null,
    "dividend_tds_inr": null,
    "lic_maturity_tds_inr": null,
    "interest_on_it_refund_inr": null,
    "dividend_inr": 220000,
    "gifts_above_50k_inr": null,
    "gifts_exemption_marriage": false,
    "gifts_exemption_relative": false,
    "family_pension_gross_inr": null,
    "family_pension_standard_deduction_inr": null,
    "winnings_lottery_gaming_inr": null,
    "online_gaming_winnings_inr": 180000,
    "deemed_dividend_from_buyback_inr": null,
    "exempt_interest_ppf_epf_inr": null,
    "taxable_epf_interest_inr": null,
    "exempt_nps_withdrawal_inr": null,
    "taxable_nps_withdrawal_inr": null,
    "exempt_pf_withdrawal_inr": null,
    "angel_tax_premium_inr": null,
    "lic_maturity_inr": null,
    "local_authority_s10_20_inr": null,
    "minor_child_exemption_inr": null,
    "spousal_clubbing_s64_inr": null,
    "miscellaneous_income_inr": null,
    "unexplained_income_115BBE_inr": 250000
   },
   "deductions": {
    "s80C": {
     "epf_employee_inr": null,
     "ppf_inr": null,
     "elss_inr": null,
     "life_insurance_premium_inr": null,
     "principal_home_loan_inr": null,
     "nsc_inr": null,
     "tuition_fees_inr": null,
     "sukanya_samriddhi_inr": null,
     "tax_saving_fd_inr": null,
     "stamp_duty_registration_inr": null
    },
    "s80CCC_80CCD1": {
     "lic_annuity_premium_inr": null,
     "nps_employee_contribution_inr": null
    },
    "s80CCD_1B": {
     "nps_additional_inr": null
    },
    "s80D": {
     "self_family_premium_inr": null,
     "self_family_preventive_checkup_inr": null,
     "parents_premium_inr": null,
     "parents_are_senior": false,
     "parents_preventive_checkup_inr": null,
     "parents_medical_expenditure_inr": null,
     "parents_has_health_insurance": true
    },
    "s80DD": {
     "has_disabled_dependents": false,
     "disability_percentage": null,
     "is_nri_blocked": true
    },
    "s80DDB": {
     "has_specified_diseases_treatment": false,
     "patient_category": null,
     "medical_expenses_inr": null,
     "is_nri_blocked": true
    },
    "s80U": {
     "has_self_disability": false,
     "disability_percentage": null,
     "is_nri_blocked": true
    },
    "s80G": [],
    "s80ggb_ggc_political_donation_inr": null,
    "s80GG": {
     "has_rent_paid_no_hra": false,
     "rent_paid_inr": null
    },
    "s80TTA_TTB": {
     "applicable_section": "80TTA",
     "savings_interest_inr": null,
     "fd_rd_interest_inr": null
    },
    "s80E": {
     "education_loan_interest_inr": null
    },
    "s80EEA_EE": {
     "affordable_home_loan_interest_inr": null,
     "loan_sanction_date": null
    },
    "s80M": {
     "dividend_income_inr": null,
     "dividend_distributed_inr": null
    },
    "special_entities": {}
   },
   "carry_forward_losses": {
    "has_brought_forward_losses": null,
    "business_loss_cf": [],
    "speculative_loss_cf": [],
    "stcg_loss_cf": [],
    "ltcg_loss_cf": [],
    "house_property_loss_cf": [],
    "unabsorbed_depreciation_cf": null,
    "unabsorbed_depreciation_attributable_to_additional_dep_inr": null,
    "s79_shareholding_change_triggered": false
   },
   "lrs_outbound": {
    "total_lrs_remitted_this_fy_inr": null,
    "lrs_purpose": null,
    "has_received_foreign_income": false
   },
   "tax_credits": {
    "advance_tax_q1_15jun_inr": null,
    "advance_tax_q2_15sep_inr": null,
    "advance_tax_q3_15dec_inr": null,
    "advance_tax_q4_15mar_inr": null,
    "tds_already_deducted_inr": 430000,
    "form_26as_uploaded": null,
    "foreign_tax_credit": [],
    "tcs_inr": null,
    "tds_inr": null
   },
   "surcharge_buckets": {
    "income_normal_slab_inr": null,
    "income_stcg_111A_inr": null,
    "income_ltcg_112A_inr": null,
    "income_ltcg_112_inr": null,
    "income_stcg_other_inr": null,
    "income_dividend_inr": null,
    "income_special_115BB_115BBJ_inr": null,
    "income_special_115A_inr": null
   },
   "nro_repatriation": {
    "cumulative_repatriated_usd_this_fy": null,
    "pending_repatriation_inr": null,
    "tds_deducted_on_nro_balance": false
   },
   "brought_forward_losses": {
    "s79_shareholding_change": null,
    "entries": []
   },
   "config": {
    "base_year": 2026
   },
   "advance_tax_simulator": {
    "enabled": false
   },
   "gift_received": {},
   "salary_exemptions": {},
   "other_exemptions": {},
   "capital_gains": {
    "has_capital_gains": true
   },
   "foreign_income": {},
   "foreign_assets": {
    "has_foreign_assets": null,
    "assets": []
   },
   "active_quarter": "Q1",
   "quarters": {
    "Q1": {
     "domestic_income": {
      "salary": {
       "has_salary_income": false,
       "taxable_salary_inr": null,
       "gross_salary_inr": null,
       "work_performed_outside_india": null,
       "workdays_in_india": null,
       "workdays_outside_india": null,
       "pwd_transport_allowance": {
        "is_eligible_pwd": false,
        "allowance_received_inr": null
       },
       "conveyance_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "tour_travel_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "daily_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "hra_received_inr": null,
       "rent_paid_inr": null,
       "is_metro_city": false,
       "basic_da_inr": null,
       "lta_claimed_inr": null,
       "perquisites_inr": null,
       "esop_perquisite_inr": null,
       "esop_perquisite_events": [],
       "professional_tax_inr": null,
       "employer_nps_contribution_inr": null,
       "prior_employer_salary_inr": null
      },
      "house_property": {
       "has_house_property_income": true,
       "properties": [
        {
         "property_use": "LOP",
         "gross_annual_value_inr": 300000,
         "municipal_taxes_paid_inr": 15000
        }
       ]
      },
      "business_income": {
       "has_business_or_fo_income": true,
       "entity_type": "individual",
       "nr_ineligible_presumptive": false,
       "nature_of_business": [
        "own_business"
       ],
       "business_code": null,
       "presumptive_scheme": [],
       "profession_type": null,
       "s115BAC_optout_history": false,
       "business_entries": [
        {
         "business_name": "Mehta Advisory Services",
         "nature": "consulting",
         "presumptive_scheme": null,
         "gross_receipts_inr": 450000,
         "expenses": {
          "opening_stock_inr": null,
          "closing_stock_inr": null,
          "rent_for_business_premises_inr": null,
          "repairs_maintenance_inr": null,
          "insurance_premium_inr": null,
          "employee_salary_wages_inr": null,
          "employee_bonus_commission_inr": null,
          "employer_pf_esi_contribution_inr": null,
          "interest_on_borrowed_capital_inr": null,
          "bad_debts_written_off_inr": null,
          "other_business_expenses_inr": null,
          "has_related_party_payments": false,
          "payments_to_non_residents_no_tds_inr": null,
          "payments_to_residents_no_tds_inr": null,
          "total_cash_payments_exceeding_limit_inr": null,
          "cash_limit_type": "10k",
          "total_cash_payments_exceeding_35k_inr": null,
          "s35_own_revenue_research_inr": null,
          "s35_own_capital_research_inr": null,
          "s35_donation_to_approved_body_inr": null,
          "s35D_total_preliminary_expenses_inr": null,
          "s35D_year_of_commencement": null,
          "s35DDA_vrs_payments_inr": null,
          "s35DDA_first_year_of_payment": null,
          "stt_paid_inr": null,
          "ctt_paid_inr": null,
          "brokerage_on_fno_inr": null,
          "exchange_charges_inr": null,
          "advisory_and_data_subscriptions_inr": null,
          "internet_proportion_inr": null,
          "home_office_proportion_inr": null,
          "margin_interest_inr": null,
          "ca_professional_fees_inr": null,
          "employer_pf_esi_paid_before_due_date": null
         }
        },
        {
         "business_name": "Mehta Equipment Rentals",
         "nature": "equipment rental",
         "presumptive_scheme": null,
         "gross_receipts_inr": 600000,
         "expenses": {
          "rent_for_business_premises_inr": 45000,
          "employee_salary_wages_inr": 75000,
          "other_business_expenses_inr": 30000,
          "payments_to_residents_no_tds_inr": 25000
         }
        }
       ],
       "s44AD_last_exit_ay": null,
       "s44AD_opted_current_year": false,
       "goods_vehicles": [],
       "opening_stock_inr": null,
       "closing_stock_inr": null,
       "gst_registration_status": "unregistered",
       "gst_collected_inr": null,
       "expenses": {
        "rent_for_business_premises_inr": null,
        "repairs_maintenance_inr": null,
        "employee_salary_wages_inr": null,
        "employee_bonus_commission_inr": null,
        "interest_on_borrowed_capital_inr": null,
        "insurance_premium_inr": null,
        "bad_debts_written_off_inr": null,
        "other_business_expenses_inr": null,
        "total_cash_payments_exceeding_limit_inr": null,
        "cash_limit_type": "10k",
        "total_cash_payments_exceeding_35k_inr": null,
        "has_related_party_payments": false,
        "payments_to_non_residents_no_tds_inr": null,
        "payments_to_residents_no_tds_inr": null,
        "s35_own_revenue_research_inr": null,
        "s35_own_capital_research_inr": null,
        "s35_donation_to_approved_body_inr": null,
        "s35D_total_preliminary_expenses_inr": null,
        "s35D_year_of_commencement": null,
        "s35DDA_vrs_payments_inr": null,
        "s35DDA_first_year_of_payment": null,
        "stt_paid_inr": null,
        "ctt_paid_inr": null,
        "brokerage_on_fno_inr": null,
        "exchange_charges_inr": null,
        "advisory_and_data_subscriptions_inr": null,
        "internet_proportion_inr": null,
        "home_office_proportion_inr": null,
        "margin_interest_inr": null,
        "ca_professional_fees_inr": null,
        "employer_pf_esi_contribution_inr": null,
        "employer_pf_esi_paid_before_due_date": null
       },
       "asset_blocks": [
        {
         "unit_biz_idx": 0,
         "unit_branch_idx": null,
         "asset_class": "plant_machinery_general",
         "opening_wdv_inr": 500000,
         "additions_during_year_inr": 125000,
         "addition_date": "2026-06-01",
         "sale_consideration_inr": 0,
         "is_new_manufacturing_asset": false
        }
       ],
       "speculative_income_inr": -20000,
       "speculative_turnover_inr": 225000,
       "non_speculative_income_inr": 62500,
       "fno_turnover_inr": 1000000,
       "s41_remission_income_inr": null,
       "s41_bad_debt_recovery_inr": null,
       "partner_firms": [
        {
         "firm_name": "Kapoor & Mehta Consulting LLP",
         "entity_type": "llp",
         "remuneration_from_entity_inr": 150000,
         "interest_on_capital_from_entity_inr": 30000,
         "profit_share_exempt_inr": 225000
        }
       ],
       "msme_payables": [
        {
         "unit_biz_idx": 0,
         "unit_branch_idx": null,
         "supplier_name": "Precision Tools Co",
         "amount_inr": 12500,
         "invoice_date": "2026-01-01",
         "has_written_agreement": false,
         "payment_date": null
        }
       ],
       "amt_credit_bf_inr": null,
       "amt_credit_bf_origin_ay": null,
       "partner_remuneration_s40b_inr": null,
       "s44bbb_receipts_inr": null,
       "specified_business_s35AD_inr": null,
       "tonnage_tax_115V_inr": null,
       "has_business_income": true
      },
      "has_agricultural_income": false,
      "agricultural_income_inr": null,
      "capital_gains": {
       "short_term_15_pct": null
      },
      "other_sources": {
       "interest_inr": null
      },
      "has_salary": false,
      "has_house_property": true,
      "has_other_sources": true
     },
     "other_sources": {
      "has_other_sources_income": true,
      "quarters": {},
      "interest_savings_inr": null,
      "interest_fd_rd_inr": 65000,
      "interest_fd_rd_tds_inr": null,
      "interest_bonds_inr": null,
      "interest_bonds_tds_inr": null,
      "dividend_tds_inr": null,
      "lic_maturity_tds_inr": null,
      "interest_on_it_refund_inr": null,
      "dividend_inr": 55000,
      "gifts_above_50k_inr": null,
      "gifts_exemption_marriage": false,
      "gifts_exemption_relative": false,
      "family_pension_gross_inr": null,
      "family_pension_standard_deduction_inr": null,
      "winnings_lottery_gaming_inr": null,
      "online_gaming_winnings_inr": 45000,
      "deemed_dividend_from_buyback_inr": null,
      "exempt_interest_ppf_epf_inr": null,
      "taxable_epf_interest_inr": null,
      "exempt_nps_withdrawal_inr": null,
      "taxable_nps_withdrawal_inr": null,
      "exempt_pf_withdrawal_inr": null,
      "angel_tax_premium_inr": null,
      "lic_maturity_inr": null,
      "local_authority_s10_20_inr": null,
      "minor_child_exemption_inr": null,
      "spousal_clubbing_s64_inr": null,
      "miscellaneous_income_inr": null,
      "unexplained_income_115BBE_inr": 62500
     },
     "lrs_outbound": {
      "total_lrs_remitted_this_fy_inr": null,
      "lrs_purpose": null,
      "has_received_foreign_income": null
     },
     "nro_repatriation": {
      "cumulative_repatriated_usd_this_fy": null,
      "pending_repatriation_inr": null,
      "tds_deducted_on_nro_balance": false
     },
     "capital_gains": {
      "has_capital_gains": true
     },
     "financial_holdings": {
      "has_financial_transactions": true,
      "transactions": [
       {
        "asset_class": "equity_mutual_fund",
        "asset_name_or_ticker": "SBI Bluechip Fund",
        "isin": null,
        "quantity": null,
        "acquisition_date": null,
        "purchase_value": 4200000,
        "purchase_currency": "INR",
        "fmv_31jan2018_per_unit_inr": null,
        "sale_date": null,
        "sale_value": null,
        "sale_currency": "INR",
        "stt_paid": true,
        "transfer_expenses": null,
        "is_specified_foreign_exchange_asset": false,
        "nri_exit_type": "redeemed_at_maturity",
        "investment_income_this_year": null,
        "asset_type": "equity_mutual_fund",
        "asset_name": "SBI Bluechip Fund",
        "value_inr": 4200000
       },
       {
        "asset_class": "equity_mutual_fund",
        "asset_name_or_ticker": "Mirae Asset Large Cap",
        "isin": null,
        "quantity": null,
        "acquisition_date": null,
        "purchase_value": 2600000,
        "purchase_currency": "INR",
        "fmv_31jan2018_per_unit_inr": null,
        "sale_date": null,
        "sale_value": null,
        "sale_currency": "INR",
        "stt_paid": true,
        "transfer_expenses": null,
        "is_specified_foreign_exchange_asset": false,
        "nri_exit_type": "redeemed_at_maturity",
        "investment_income_this_year": null,
        "asset_type": "equity_mutual_fund",
        "asset_name": "Mirae Asset Large Cap",
        "value_inr": 2600000
       },
       {
        "asset_class": "listed_equity",
        "asset_name_or_ticker": "HDFCBANK",
        "isin": null,
        "quantity": 800,
        "acquisition_date": "2025-12-01",
        "purchase_value": 1220000,
        "purchase_currency": "INR",
        "fmv_31jan2018_per_unit_inr": null,
        "sale_date": "2026-08-20",
        "sale_value": 1400000,
        "sale_currency": "INR",
        "stt_paid": true,
        "transfer_expenses": 0,
        "is_specified_foreign_exchange_asset": false,
        "nri_exit_type": "redeemed_at_maturity",
        "investment_income_this_year": null
       }
      ]
     },
     "commodities": {
      "has_commodity_transactions": false,
      "transactions": []
     },
     "unlisted_equity": {
      "has_unlisted_equity_transaction": false,
      "transactions": []
     },
     "property": {
      "has_indian_property_transaction": true,
      "properties": [
       {
        "property_type": "residential",
        "status": "holding",
        "address": "Villa 4, Bengaluru",
        "pincode": null,
        "buyer_name": null,
        "buyer_pan": null,
        "acquisition_date": null,
        "actual_cost": null,
        "actual_cost_currency": "INR",
        "pre_2001_fmv_inr": null,
        "transfer_expenses_inr": null,
        "sale_date": null,
        "sale_consideration": null,
        "sale_consideration_currency": null,
        "stamp_duty_value": null,
        "stamp_duty_value_currency": "INR",
        "buyer_tan": null,
        "buyer_tds_deducted_inr": null,
        "buyer_tds_challan_number": null,
        "is_joint_property": false,
        "ownership_percentage": null,
        "is_inherited": false,
        "original_owner_acquisition_date": null,
        "original_owner_cost": null,
        "original_owner_cost_currency": null,
        "cg_exemption_section": null,
        "cg_exempt_invest_amount": null,
        "cg_exempt_invest_date": null,
        "cg_deposited_in_cgas": false,
        "improvements": [],
        "annual_value_inr": 840000,
        "gross_rent_received_inr": 1200000,
        "municipal_taxes_paid_inr": 60000
       }
      ]
     }
    },
    "Q2": {
     "domestic_income": {
      "salary": {
       "has_salary_income": false,
       "taxable_salary_inr": null,
       "gross_salary_inr": null,
       "work_performed_outside_india": null,
       "workdays_in_india": null,
       "workdays_outside_india": null,
       "pwd_transport_allowance": {
        "is_eligible_pwd": false,
        "allowance_received_inr": null
       },
       "conveyance_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "tour_travel_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "daily_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "hra_received_inr": null,
       "rent_paid_inr": null,
       "is_metro_city": false,
       "basic_da_inr": null,
       "lta_claimed_inr": null,
       "perquisites_inr": null,
       "esop_perquisite_inr": null,
       "esop_perquisite_events": [],
       "professional_tax_inr": null,
       "employer_nps_contribution_inr": null,
       "prior_employer_salary_inr": null
      },
      "house_property": {
       "has_house_property_income": true,
       "properties": [
        {
         "property_use": "LOP",
         "gross_annual_value_inr": 300000,
         "municipal_taxes_paid_inr": 15000
        }
       ]
      },
      "business_income": {
       "has_business_or_fo_income": true,
       "entity_type": "individual",
       "nr_ineligible_presumptive": false,
       "nature_of_business": [],
       "business_code": null,
       "presumptive_scheme": [],
       "profession_type": null,
       "s115BAC_optout_history": false,
       "business_entries": [
        {
         "business_name": "Mehta Advisory Services",
         "nature": "consulting",
         "presumptive_scheme": null,
         "gross_receipts_inr": 450000
        },
        {
         "business_name": "Mehta Equipment Rentals",
         "nature": "equipment rental",
         "presumptive_scheme": null,
         "gross_receipts_inr": 600000,
         "expenses": {
          "rent_for_business_premises_inr": 45000,
          "employee_salary_wages_inr": 75000,
          "other_business_expenses_inr": 30000,
          "payments_to_residents_no_tds_inr": 25000
         }
        }
       ],
       "s44AD_last_exit_ay": null,
       "s44AD_opted_current_year": false,
       "goods_vehicles": [],
       "opening_stock_inr": null,
       "closing_stock_inr": null,
       "gst_registration_status": "unregistered",
       "gst_collected_inr": null,
       "expenses": {
        "rent_for_business_premises_inr": null,
        "repairs_maintenance_inr": null,
        "employee_salary_wages_inr": null,
        "employee_bonus_commission_inr": null,
        "interest_on_borrowed_capital_inr": null,
        "insurance_premium_inr": null,
        "bad_debts_written_off_inr": null,
        "other_business_expenses_inr": null,
        "total_cash_payments_exceeding_limit_inr": null,
        "cash_limit_type": "10k",
        "total_cash_payments_exceeding_35k_inr": null,
        "has_related_party_payments": false,
        "payments_to_non_residents_no_tds_inr": null,
        "payments_to_residents_no_tds_inr": null,
        "s35_own_revenue_research_inr": null,
        "s35_own_capital_research_inr": null,
        "s35_donation_to_approved_body_inr": null,
        "s35D_total_preliminary_expenses_inr": null,
        "s35D_year_of_commencement": null,
        "s35DDA_vrs_payments_inr": null,
        "s35DDA_first_year_of_payment": null,
        "stt_paid_inr": null,
        "ctt_paid_inr": null,
        "brokerage_on_fno_inr": null,
        "exchange_charges_inr": null,
        "advisory_and_data_subscriptions_inr": null,
        "internet_proportion_inr": null,
        "home_office_proportion_inr": null,
        "margin_interest_inr": null,
        "ca_professional_fees_inr": null,
        "employer_pf_esi_contribution_inr": null,
        "employer_pf_esi_paid_before_due_date": null
       },
       "asset_blocks": [
        {
         "unit_biz_idx": 0,
         "unit_branch_idx": null,
         "asset_class": "plant_machinery_general",
         "opening_wdv_inr": 500000,
         "additions_during_year_inr": 125000,
         "addition_date": "2026-06-01",
         "sale_consideration_inr": 0,
         "is_new_manufacturing_asset": false
        }
       ],
       "speculative_income_inr": -20000,
       "speculative_turnover_inr": 225000,
       "non_speculative_income_inr": 62500,
       "fno_turnover_inr": 1000000,
       "s41_remission_income_inr": null,
       "s41_bad_debt_recovery_inr": null,
       "partner_firms": [
        {
         "firm_name": "Kapoor & Mehta Consulting LLP",
         "entity_type": "llp",
         "remuneration_from_entity_inr": 150000,
         "interest_on_capital_from_entity_inr": 30000,
         "profit_share_exempt_inr": 225000
        }
       ],
       "msme_payables": [
        {
         "unit_biz_idx": 0,
         "unit_branch_idx": null,
         "supplier_name": "Precision Tools Co",
         "amount_inr": 12500,
         "invoice_date": "2026-01-01",
         "has_written_agreement": false,
         "payment_date": null
        }
       ],
       "amt_credit_bf_inr": null,
       "amt_credit_bf_origin_ay": null,
       "partner_remuneration_s40b_inr": null,
       "s44bbb_receipts_inr": null,
       "specified_business_s35AD_inr": null,
       "tonnage_tax_115V_inr": null
      },
      "has_agricultural_income": false,
      "agricultural_income_inr": null,
      "capital_gains": {
       "short_term_15_pct": null
      },
      "other_sources": {
       "interest_inr": null
      }
     },
     "other_sources": {
      "has_other_sources_income": true,
      "quarters": {},
      "interest_savings_inr": null,
      "interest_fd_rd_inr": 65000,
      "interest_fd_rd_tds_inr": null,
      "interest_bonds_inr": null,
      "interest_bonds_tds_inr": null,
      "dividend_tds_inr": null,
      "lic_maturity_tds_inr": null,
      "interest_on_it_refund_inr": null,
      "dividend_inr": 55000,
      "gifts_above_50k_inr": null,
      "gifts_exemption_marriage": false,
      "gifts_exemption_relative": false,
      "family_pension_gross_inr": null,
      "family_pension_standard_deduction_inr": null,
      "winnings_lottery_gaming_inr": null,
      "online_gaming_winnings_inr": 45000,
      "deemed_dividend_from_buyback_inr": null,
      "exempt_interest_ppf_epf_inr": null,
      "taxable_epf_interest_inr": null,
      "exempt_nps_withdrawal_inr": null,
      "taxable_nps_withdrawal_inr": null,
      "exempt_pf_withdrawal_inr": null,
      "angel_tax_premium_inr": null,
      "lic_maturity_inr": null,
      "local_authority_s10_20_inr": null,
      "minor_child_exemption_inr": null,
      "spousal_clubbing_s64_inr": null,
      "miscellaneous_income_inr": null,
      "unexplained_income_115BBE_inr": 62500
     },
     "lrs_outbound": {
      "total_lrs_remitted_this_fy_inr": null,
      "lrs_purpose": null,
      "has_received_foreign_income": false
     },
     "nro_repatriation": {
      "cumulative_repatriated_usd_this_fy": null,
      "pending_repatriation_inr": null,
      "tds_deducted_on_nro_balance": false
     },
     "capital_gains": {},
     "financial_holdings": {
      "has_financial_transactions": false,
      "transactions": []
     },
     "commodities": {
      "has_commodity_transactions": false,
      "transactions": []
     },
     "unlisted_equity": {
      "has_unlisted_equity_transaction": false,
      "transactions": []
     },
     "property": {
      "has_indian_property_transaction": false,
      "properties": []
     }
    },
    "Q3": {
     "domestic_income": {
      "salary": {
       "has_salary_income": false,
       "taxable_salary_inr": null,
       "gross_salary_inr": null,
       "work_performed_outside_india": null,
       "workdays_in_india": null,
       "workdays_outside_india": null,
       "pwd_transport_allowance": {
        "is_eligible_pwd": false,
        "allowance_received_inr": null
       },
       "conveyance_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "tour_travel_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "daily_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "hra_received_inr": null,
       "rent_paid_inr": null,
       "is_metro_city": false,
       "basic_da_inr": null,
       "lta_claimed_inr": null,
       "perquisites_inr": null,
       "esop_perquisite_inr": null,
       "esop_perquisite_events": [],
       "professional_tax_inr": null,
       "employer_nps_contribution_inr": null,
       "prior_employer_salary_inr": null
      },
      "house_property": {
       "has_house_property_income": true,
       "properties": [
        {
         "property_use": "LOP",
         "gross_annual_value_inr": 300000,
         "municipal_taxes_paid_inr": 15000
        }
       ]
      },
      "business_income": {
       "has_business_or_fo_income": true,
       "entity_type": "individual",
       "nr_ineligible_presumptive": false,
       "nature_of_business": [],
       "business_code": null,
       "presumptive_scheme": [],
       "profession_type": null,
       "s115BAC_optout_history": false,
       "business_entries": [
        {
         "business_name": "Mehta Advisory Services",
         "nature": "consulting",
         "presumptive_scheme": null,
         "gross_receipts_inr": 450000
        },
        {
         "business_name": "Mehta Equipment Rentals",
         "nature": "equipment rental",
         "presumptive_scheme": null,
         "gross_receipts_inr": 600000,
         "expenses": {
          "rent_for_business_premises_inr": 45000,
          "employee_salary_wages_inr": 75000,
          "other_business_expenses_inr": 30000,
          "payments_to_residents_no_tds_inr": 25000
         }
        }
       ],
       "s44AD_last_exit_ay": null,
       "s44AD_opted_current_year": false,
       "goods_vehicles": [],
       "opening_stock_inr": null,
       "closing_stock_inr": null,
       "gst_registration_status": "unregistered",
       "gst_collected_inr": null,
       "expenses": {
        "rent_for_business_premises_inr": null,
        "repairs_maintenance_inr": null,
        "employee_salary_wages_inr": null,
        "employee_bonus_commission_inr": null,
        "interest_on_borrowed_capital_inr": null,
        "insurance_premium_inr": null,
        "bad_debts_written_off_inr": null,
        "other_business_expenses_inr": null,
        "total_cash_payments_exceeding_limit_inr": null,
        "cash_limit_type": "10k",
        "total_cash_payments_exceeding_35k_inr": null,
        "has_related_party_payments": false,
        "payments_to_non_residents_no_tds_inr": null,
        "payments_to_residents_no_tds_inr": null,
        "s35_own_revenue_research_inr": null,
        "s35_own_capital_research_inr": null,
        "s35_donation_to_approved_body_inr": null,
        "s35D_total_preliminary_expenses_inr": null,
        "s35D_year_of_commencement": null,
        "s35DDA_vrs_payments_inr": null,
        "s35DDA_first_year_of_payment": null,
        "stt_paid_inr": null,
        "ctt_paid_inr": null,
        "brokerage_on_fno_inr": null,
        "exchange_charges_inr": null,
        "advisory_and_data_subscriptions_inr": null,
        "internet_proportion_inr": null,
        "home_office_proportion_inr": null,
        "margin_interest_inr": null,
        "ca_professional_fees_inr": null,
        "employer_pf_esi_contribution_inr": null,
        "employer_pf_esi_paid_before_due_date": null
       },
       "asset_blocks": [
        {
         "unit_biz_idx": 0,
         "unit_branch_idx": null,
         "asset_class": "plant_machinery_general",
         "opening_wdv_inr": 500000,
         "additions_during_year_inr": 125000,
         "addition_date": "2026-06-01",
         "sale_consideration_inr": 0,
         "is_new_manufacturing_asset": false
        }
       ],
       "speculative_income_inr": -20000,
       "speculative_turnover_inr": 225000,
       "non_speculative_income_inr": 62500,
       "fno_turnover_inr": 1000000,
       "s41_remission_income_inr": null,
       "s41_bad_debt_recovery_inr": null,
       "partner_firms": [
        {
         "firm_name": "Kapoor & Mehta Consulting LLP",
         "entity_type": "llp",
         "remuneration_from_entity_inr": 150000,
         "interest_on_capital_from_entity_inr": 30000,
         "profit_share_exempt_inr": 225000
        }
       ],
       "msme_payables": [
        {
         "unit_biz_idx": 0,
         "unit_branch_idx": null,
         "supplier_name": "Precision Tools Co",
         "amount_inr": 12500,
         "invoice_date": "2026-01-01",
         "has_written_agreement": false,
         "payment_date": null
        }
       ],
       "amt_credit_bf_inr": null,
       "amt_credit_bf_origin_ay": null,
       "partner_remuneration_s40b_inr": null,
       "s44bbb_receipts_inr": null,
       "specified_business_s35AD_inr": null,
       "tonnage_tax_115V_inr": null
      },
      "has_agricultural_income": false,
      "agricultural_income_inr": null,
      "capital_gains": {
       "short_term_15_pct": null
      },
      "other_sources": {
       "interest_inr": null
      }
     },
     "other_sources": {
      "has_other_sources_income": true,
      "quarters": {},
      "interest_savings_inr": null,
      "interest_fd_rd_inr": 65000,
      "interest_fd_rd_tds_inr": null,
      "interest_bonds_inr": null,
      "interest_bonds_tds_inr": null,
      "dividend_tds_inr": null,
      "lic_maturity_tds_inr": null,
      "interest_on_it_refund_inr": null,
      "dividend_inr": 55000,
      "gifts_above_50k_inr": null,
      "gifts_exemption_marriage": false,
      "gifts_exemption_relative": false,
      "family_pension_gross_inr": null,
      "family_pension_standard_deduction_inr": null,
      "winnings_lottery_gaming_inr": null,
      "online_gaming_winnings_inr": 45000,
      "deemed_dividend_from_buyback_inr": null,
      "exempt_interest_ppf_epf_inr": null,
      "taxable_epf_interest_inr": null,
      "exempt_nps_withdrawal_inr": null,
      "taxable_nps_withdrawal_inr": null,
      "exempt_pf_withdrawal_inr": null,
      "angel_tax_premium_inr": null,
      "lic_maturity_inr": null,
      "local_authority_s10_20_inr": null,
      "minor_child_exemption_inr": null,
      "spousal_clubbing_s64_inr": null,
      "miscellaneous_income_inr": null,
      "unexplained_income_115BBE_inr": 62500
     },
     "lrs_outbound": {
      "total_lrs_remitted_this_fy_inr": null,
      "lrs_purpose": null,
      "has_received_foreign_income": false
     },
     "nro_repatriation": {
      "cumulative_repatriated_usd_this_fy": null,
      "pending_repatriation_inr": null,
      "tds_deducted_on_nro_balance": false
     },
     "capital_gains": {},
     "financial_holdings": {
      "has_financial_transactions": false,
      "transactions": []
     },
     "commodities": {
      "has_commodity_transactions": false,
      "transactions": []
     },
     "unlisted_equity": {
      "has_unlisted_equity_transaction": false,
      "transactions": []
     },
     "property": {
      "has_indian_property_transaction": false,
      "properties": []
     }
    },
    "Q4": {
     "domestic_income": {
      "salary": {
       "has_salary_income": false,
       "taxable_salary_inr": null,
       "gross_salary_inr": null,
       "work_performed_outside_india": null,
       "workdays_in_india": null,
       "workdays_outside_india": null,
       "pwd_transport_allowance": {
        "is_eligible_pwd": false,
        "allowance_received_inr": null
       },
       "conveyance_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "tour_travel_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "daily_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "hra_received_inr": null,
       "rent_paid_inr": null,
       "is_metro_city": false,
       "basic_da_inr": null,
       "lta_claimed_inr": null,
       "perquisites_inr": null,
       "esop_perquisite_inr": null,
       "esop_perquisite_events": [],
       "professional_tax_inr": null,
       "employer_nps_contribution_inr": null,
       "prior_employer_salary_inr": null
      },
      "house_property": {
       "has_house_property_income": true,
       "properties": [
        {
         "property_use": "LOP",
         "gross_annual_value_inr": 300000,
         "municipal_taxes_paid_inr": 15000
        }
       ]
      },
      "business_income": {
       "has_business_or_fo_income": true,
       "entity_type": "individual",
       "nr_ineligible_presumptive": false,
       "nature_of_business": [],
       "business_code": null,
       "presumptive_scheme": [],
       "profession_type": null,
       "s115BAC_optout_history": false,
       "business_entries": [
        {
         "business_name": "Mehta Advisory Services",
         "nature": "consulting",
         "presumptive_scheme": null,
         "gross_receipts_inr": 450000
        },
        {
         "business_name": "Mehta Equipment Rentals",
         "nature": "equipment rental",
         "presumptive_scheme": null,
         "gross_receipts_inr": 600000,
         "expenses": {
          "rent_for_business_premises_inr": 45000,
          "employee_salary_wages_inr": 75000,
          "other_business_expenses_inr": 30000,
          "payments_to_residents_no_tds_inr": 25000
         }
        }
       ],
       "s44AD_last_exit_ay": null,
       "s44AD_opted_current_year": false,
       "goods_vehicles": [],
       "opening_stock_inr": null,
       "closing_stock_inr": null,
       "gst_registration_status": "unregistered",
       "gst_collected_inr": null,
       "expenses": {
        "rent_for_business_premises_inr": null,
        "repairs_maintenance_inr": null,
        "employee_salary_wages_inr": null,
        "employee_bonus_commission_inr": null,
        "interest_on_borrowed_capital_inr": null,
        "insurance_premium_inr": null,
        "bad_debts_written_off_inr": null,
        "other_business_expenses_inr": null,
        "total_cash_payments_exceeding_limit_inr": null,
        "cash_limit_type": "10k",
        "total_cash_payments_exceeding_35k_inr": null,
        "has_related_party_payments": false,
        "payments_to_non_residents_no_tds_inr": null,
        "payments_to_residents_no_tds_inr": null,
        "s35_own_revenue_research_inr": null,
        "s35_own_capital_research_inr": null,
        "s35_donation_to_approved_body_inr": null,
        "s35D_total_preliminary_expenses_inr": null,
        "s35D_year_of_commencement": null,
        "s35DDA_vrs_payments_inr": null,
        "s35DDA_first_year_of_payment": null,
        "stt_paid_inr": null,
        "ctt_paid_inr": null,
        "brokerage_on_fno_inr": null,
        "exchange_charges_inr": null,
        "advisory_and_data_subscriptions_inr": null,
        "internet_proportion_inr": null,
        "home_office_proportion_inr": null,
        "margin_interest_inr": null,
        "ca_professional_fees_inr": null,
        "employer_pf_esi_contribution_inr": null,
        "employer_pf_esi_paid_before_due_date": null
       },
       "asset_blocks": [
        {
         "unit_biz_idx": 1,
         "unit_branch_idx": null,
         "asset_class": "plant_machinery_general",
         "opening_wdv_inr": 500000,
         "additions_during_year_inr": 125000,
         "addition_date": "2026-06-01",
         "sale_consideration_inr": 0,
         "is_new_manufacturing_asset": false
        }
       ],
       "speculative_income_inr": -20000,
       "speculative_turnover_inr": 225000,
       "non_speculative_income_inr": 62500,
       "fno_turnover_inr": 1000000,
       "s41_remission_income_inr": null,
       "s41_bad_debt_recovery_inr": null,
       "partner_firms": [
        {
         "firm_name": "Kapoor & Mehta Consulting LLP",
         "entity_type": "llp",
         "remuneration_from_entity_inr": 150000,
         "interest_on_capital_from_entity_inr": 30000,
         "profit_share_exempt_inr": 225000
        }
       ],
       "msme_payables": [
        {
         "unit_biz_idx": 1,
         "unit_branch_idx": null,
         "supplier_name": "Precision Tools Co",
         "amount_inr": 12500,
         "invoice_date": "2026-01-01",
         "has_written_agreement": false,
         "payment_date": null
        }
       ],
       "amt_credit_bf_inr": null,
       "amt_credit_bf_origin_ay": null,
       "partner_remuneration_s40b_inr": null,
       "s44bbb_receipts_inr": null,
       "specified_business_s35AD_inr": null,
       "tonnage_tax_115V_inr": null
      },
      "has_agricultural_income": false,
      "agricultural_income_inr": null,
      "capital_gains": {
       "short_term_15_pct": null
      },
      "other_sources": {
       "interest_inr": null
      }
     },
     "other_sources": {
      "has_other_sources_income": true,
      "quarters": {},
      "interest_savings_inr": null,
      "interest_fd_rd_inr": 65000,
      "interest_fd_rd_tds_inr": null,
      "interest_bonds_inr": null,
      "interest_bonds_tds_inr": null,
      "dividend_tds_inr": null,
      "lic_maturity_tds_inr": null,
      "interest_on_it_refund_inr": null,
      "dividend_inr": 55000,
      "gifts_above_50k_inr": null,
      "gifts_exemption_marriage": false,
      "gifts_exemption_relative": false,
      "family_pension_gross_inr": null,
      "family_pension_standard_deduction_inr": null,
      "winnings_lottery_gaming_inr": null,
      "online_gaming_winnings_inr": 45000,
      "deemed_dividend_from_buyback_inr": null,
      "exempt_interest_ppf_epf_inr": null,
      "taxable_epf_interest_inr": null,
      "exempt_nps_withdrawal_inr": null,
      "taxable_nps_withdrawal_inr": null,
      "exempt_pf_withdrawal_inr": null,
      "angel_tax_premium_inr": null,
      "lic_maturity_inr": null,
      "local_authority_s10_20_inr": null,
      "minor_child_exemption_inr": null,
      "spousal_clubbing_s64_inr": null,
      "miscellaneous_income_inr": null,
      "unexplained_income_115BBE_inr": 62500
     },
     "lrs_outbound": {
      "total_lrs_remitted_this_fy_inr": null,
      "lrs_purpose": null,
      "has_received_foreign_income": false
     },
     "nro_repatriation": {
      "cumulative_repatriated_usd_this_fy": null,
      "pending_repatriation_inr": null,
      "tds_deducted_on_nro_balance": false
     },
     "capital_gains": {},
     "financial_holdings": {
      "has_financial_transactions": false,
      "transactions": []
     },
     "commodities": {
      "has_commodity_transactions": false,
      "transactions": []
     },
     "unlisted_equity": {
      "has_unlisted_equity_transaction": false,
      "transactions": []
     },
     "property": {
      "has_indian_property_transaction": false,
      "properties": []
     }
    }
   },
   "metadata": {
    "financial_year": "TY2026-27",
    "schema_version": "layer1_india_v5_1"
   }
  },
  "us": {
   "profile": {
    "tax_entity_type": "individual",
    "llc_tax_election": "individual",
    "incorporation_state": null,
    "incorporated_in_us": null,
    "full_name": "Rohan Mehta",
    "date_of_birth": "1985-03-22",
    "filing_status": "mfj",
    "ssn_or_itin": null,
    "ssn_or_itin_type": "ssn",
    "dependents_count": 0,
    "spouse_is_us_person": true,
    "is_blind": false,
    "spouse_client_id": "c_priya_mehta",
    "household_items_owner": "self",
    "spouse_has_income_or_filings": "yes",
    "spouse_full_name": null,
    "spouse_ssn_or_itin_type": null,
    "spouse_date_of_birth": null,
    "spouse_residency_status": null,
    "spouse_is_blind": false,
    "trump_accounts_opened": false,
    "trump_accounts_children": [],
    "trump_accounts_num_children": 0,
    "trump_accounts_children_born_2025_2028": 0,
    "trump_accounts_total_contributions_usd": 0,
    "trust_retained_income_usd": 0
   },
   "corporate_profile": {
    "entity_name": null,
    "ein": null,
    "date_of_incorporation": null,
    "state_of_domicile": null,
    "naics_code": null,
    "fiscal_year_end": "12-31",
    "is_foreign_owned_25_pct": false,
    "is_foreign_corporation": false
   },
   "corporate_international": {
    "fdii_eligible_income": null,
    "ncti_tested_income": null,
    "form_5472_related_parties": []
   },
   "corporate_financials": {
    "schedule_l": {
     "assets_beginning": 0,
     "assets_ending": 0,
     "liabilities_beginning": 0,
     "liabilities_ending": 0,
     "equity_beginning": 0,
     "equity_ending": 0
    },
    "schedule_m1": {
     "net_income_per_books": 0,
     "federal_tax_expense": 0,
     "meals_disallowed_50": 0,
     "tax_depreciation_over_book": 0,
     "taxable_income": 0
    },
    "schedule_m2": {
     "retained_earnings_beginning": 0,
     "distributions_dividends_paid": 0,
     "retained_earnings_ending": 0
    }
   },
   "us_residency_detail": {
    "is_us_citizen": false,
    "has_green_card": true,
    "green_card_grant_date": null,
    "i407_surrendered_date": null,
    "green_card_years_held": 0,
    "expatriation_net_worth_usd": 0,
    "expatriation_avg_net_income_tax_usd": 0,
    "form_8854_5yr_compliance_certified": false,
    "us_days_current_year": 345,
    "us_days_minus_1_year": 0,
    "us_days_minus_2_years": 0,
    "exempt_individual_status": "none",
    "exempt_first_year": null,
    "exempt_prior_years_count": 0,
    "exempt_student_closer_conn_exception": false,
    "exempt_scholar_lookback_exception": false,
    "closer_connection_claim": null,
    "first_year_choice_election": false,
    "first_year_choice_entry_date": null,
    "s6013g_joint_election": false,
    "spt_day_count_weighted": 345,
    "spt_test_met": true,
    "final_us_residency_status": "RESIDENT_ALIEN",
    "dtaa_treaty_residence": "none",
    "residency_start_date": "2026-01-01",
    "residency_end_date": "2026-12-31"
   },
   "corp_state_nexus": {
    "physical_states": [],
    "economic_states": [],
    "needs_apportionment": false,
    "apportionment_factors": {},
    "has_remote_workers": false
   },
   "state_residency": {
    "jan_1_domicile_state": "",
    "dec_31_domicile_state": "",
    "total_states_footprint": [],
    "primary_state_of_residence": "NY",
    "moved_states_this_year": false,
    "previous_state": "",
    "move_date": null,
    "state_days_in_current_state": null,
    "dependents_school_state": "",
    "primary_bank_and_medical_nexus_state": "",
    "vehicles_registered_state": "",
    "active_duty_military_or_spouse": false,
    "military_home_state_of_record": "",
    "military_duty_station_state": "",
    "ca_planning_departure": false,
    "ca_retains_property_or_voter_reg": false,
    "footprint_details": {}
   },
   "income_us_source": {
    "has_employment_income": true,
    "has_capital_gains": false,
    "has_crypto": false,
    "stocks_needs_wash_sale_reconciliation": false,
    "crypto_needs_wash_sale": false,
    "has_sec_1256": false,
    "has_qof_rollover": false,
    "has_qsbs": false,
    "has_real_estate": false,
    "has_1031_exchange": false,
    "has_installment_sale": false,
    "has_collectibles": false,
    "has_capital_loss_carryovers": false,
    "st_loss_carryover_usd": null,
    "lt_loss_carryover_usd": null,
    "self_employment": [
     {
      "id": "se-17907771624107f7",
      "business_name": "Mehta Analytics (consulting)",
      "branches": [],
      "naics_code": null,
      "industry_category": null,
      "has_se_income": true,
      "gross_receipts_usd": 62000,
      "returns_and_allowances_usd": 0,
      "other_income_usd": 0,
      "expenses_usd": 0,
      "itemized_expenses": {
       "advertising": null,
       "contract_labor": null,
       "insurance": null,
       "legal_professional": null,
       "business_meals": null,
       "office_expenses": null,
       "rent_lease": null,
       "repairs_maintenance": null,
       "supplies": null,
       "utilities": null,
       "taxes_and_licenses": null,
       "travel": null,
       "commissions": null,
       "other": null
      },
      "is_specified_service_trade": false,
      "qbi_eligible": false,
      "statutory_w2_link_id": null,
      "accounting_method": "cash",
      "llc_type": "sole_prop",
      "tax_election": "disregarded",
      "wages_paid_usd": 0,
      "se_health_insurance_usd": 0,
      "se_retirement_contrib_usd": 0,
      "vehicle_miles": 0,
      "commuting_miles": 0,
      "other_personal_miles": 0,
      "vehicle_available_personal_use": false,
      "has_written_evidence": false,
      "home_office_sqft": 0,
      "total_home_sqft": 0,
      "cogs_method": "cost",
      "cogs_beginning_inventory": 0,
      "cogs_purchases": 0,
      "cogs_labor": 0,
      "cogs_materials": 0,
      "cogs_ending_inventory": 0,
      "forms_1099": [],
      "state_allocations": [],
      "assets": []
     }
    ],
    "partnerships_k1": [
     {
      "id": "part-k1-1790777162410u41",
      "business_name": "Meridian Consulting Partners LLC",
      "ein": null,
      "naics_code": null,
      "industry_category": null,
      "has_part_income": true,
      "branches": [],
      "gross_revenue": null,
      "returns_allowances": null,
      "cogs_itemized": null,
      "misc_income": null,
      "exp_wages": null,
      "exp_labor": null,
      "exp_rent": null,
      "exp_repairs": null,
      "exp_bad_debts": null,
      "exp_taxes": null,
      "exp_interest_paid": null,
      "exp_charity": null,
      "exp_adv": null,
      "exp_benefits": null,
      "exp_pension": null,
      "exp_depletion": null,
      "exp_legal": null,
      "exp_utilities": null,
      "exp_insurance": null,
      "exp_travel_meals": null,
      "exp_office_supplies": null,
      "exp_other": null,
      "partner_type": "general",
      "material_participation": "active",
      "tax_basis_usd": null,
      "at_risk_basis_usd": null,
      "ordinary_income_usd": 18000,
      "net_rental_real_estate_usd": null,
      "other_rental_income_usd": null,
      "guaranteed_payments_usd": 12000,
      "interest_income_usd": 900,
      "ordinary_dividends_usd": null,
      "qualified_dividends_usd": null,
      "royalties_usd": null,
      "stcg_usd": null,
      "ltcg_usd": null,
      "collectibles_gain_usd": null,
      "unrecaptured_1250_gain_usd": null,
      "net_sec1231_gain_usd": null,
      "other_income_usd": null,
      "sec179_deduction_usd": 2000,
      "charitable_contributions_usd": null,
      "investment_interest_usd": null,
      "self_employment_earnings_usd": 30000,
      "credits_usd": null,
      "foreign_transactions_usd": null,
      "amt_items_usd": null,
      "tax_exempt_income_usd": null,
      "nondeductible_expenses_usd": null,
      "distributions_usd": null,
      "qbi_eligible": false,
      "is_specified_service_trade": false,
      "active_rental_participant": false,
      "qbi_wages_usd": 22000,
      "qbi_ubia_usd": 8000,
      "partner_ein": "",
      "partnership_ein": null,
      "partner_entity_type": "individual",
      "general_partner": false,
      "profit_percentage_beg": null,
      "profit_percentage_end": null,
      "loss_percentage_beg": null,
      "loss_percentage_end": null,
      "capital_percentage_beg": null,
      "capital_percentage_end": null,
      "partner_share_nonrecourse_usd": null,
      "partner_share_qualified_nonrecourse_usd": null,
      "partner_share_recourse_usd": null,
      "partners": [
       {
        "id": "partner-17907771624590vd",
        "name": "",
        "tin": "",
        "type": "limited",
        "entity_type": "individual",
        "profit_beg": null,
        "profit_end": null,
        "loss_beg": null,
        "loss_end": null,
        "capital_beg": null,
        "capital_end": null,
        "nonrecourse": null,
        "qual_nonrecourse": null,
        "recourse": null,
        "is_taxpayer": true
       }
      ],
      "forms_1099": [],
      "state_allocations": [],
      "assets": []
     }
    ],
    "s_corporations_k1": [
     {
      "id": "scorp-k1-1790777162410rbn",
      "business_name": "Harborline Print Co",
      "ein": null,
      "naics_code": null,
      "industry_category": null,
      "has_scorp_income": true,
      "gross_revenue": null,
      "returns_allowances": null,
      "cogs_itemized": null,
      "misc_income": null,
      "exp_wages": null,
      "exp_officer": null,
      "exp_labor": null,
      "exp_rent": null,
      "exp_repairs": null,
      "exp_bad_debts": null,
      "exp_taxes": null,
      "exp_interest_paid": null,
      "exp_charity": null,
      "exp_adv": null,
      "exp_benefits": null,
      "exp_pension": null,
      "exp_depletion": null,
      "exp_legal": null,
      "exp_utilities": null,
      "exp_insurance": null,
      "exp_travel_meals": null,
      "exp_office_supplies": null,
      "exp_other": null,
      "ownership_percent": null,
      "material_participation": "active",
      "tax_basis_usd": null,
      "at_risk_basis_usd": null,
      "ordinary_income_usd": 9000,
      "net_rental_real_estate_usd": null,
      "other_rental_income_usd": null,
      "interest_income_usd": null,
      "ordinary_dividends_usd": 500,
      "qualified_dividends_usd": null,
      "royalties_usd": null,
      "stcg_usd": null,
      "ltcg_usd": null,
      "collectibles_gain_usd": null,
      "unrecaptured_1250_gain_usd": null,
      "sec1231_gain_usd": null,
      "other_income_usd": null,
      "sec179_deduction_usd": null,
      "charitable_contributions_usd": null,
      "investment_interest_usd": null,
      "credits_usd": null,
      "foreign_transactions_usd": null,
      "amt_items_usd": null,
      "tax_exempt_income_usd": null,
      "nondeductible_expenses_usd": null,
      "distributions_usd": null,
      "qbi_eligible": false,
      "is_specified_service_trade": false,
      "active_rental_participant": false,
      "qbi_wages_usd": 14000,
      "qbi_ubia_usd": 45000,
      "shareholders": [
       {
        "id": "shareholder-17907771624716pp",
        "name": "",
        "tin": "",
        "percent": null,
        "is_taxpayer": true
       }
      ],
      "forms_1099": [],
      "branches": [],
      "assets": [],
      "state_allocations": []
     }
    ],
    "c_corporations_1120": [],
    "farming_schedule_f": [],
    "trusts_estates_k1": [],
    "se_health_insurance_deduction_usd": null,
    "se_retirement_deduction_usd": null,
    "cg_manual_st_proceeds_usd": null,
    "cg_manual_st_basis_usd": null,
    "cg_manual_lt_proceeds_usd": null,
    "cg_manual_lt_basis_usd": null,
    "cg_manual_stcg_usd": null,
    "cg_manual_ltcg_usd": null,
    "interest_us_source_usd": 5200,
    "ordinary_dividends_us_source_usd": 6400,
    "qualified_dividends_us_source_usd": 4000,
    "ltcg_us_source_usd": 12000,
    "rental_income_us_source_usd": 27000,
    "royalty_income_us_source_usd": null,
    "k1_passthrough_income_usd": null,
    "ira_distributions_usd": null,
    "401k_distributions_usd": null,
    "crypto_transactions": [],
    "wages_w2": [
     {
      "id": "w2-1790777162438mit",
      "employer_name": "Northwind Labs",
      "employer_street": null,
      "employer_city": null,
      "employer_state": null,
      "employer_zip": null,
      "wages_box1_usd": 158000,
      "qualified_tip_income_usd": 2400,
      "qualified_overtime_premium_usd": 5800,
      "workdays_in_us": null,
      "workdays_outside_us": null,
      "tax_details_collapsed_by_default": {
       "employer_ein": null,
       "control_number": null,
       "federal_tax_withheld_usd": 30000,
       "ss_wages_box3_usd": null,
       "ss_tax_withheld_usd": null,
       "medicare_wages_box5_usd": 158000,
       "medicare_tax_withheld_usd": null,
       "ss_tips_box7_usd": null,
       "allocated_tips_box8_usd": null,
       "dependent_care_benefits_box10_usd": null,
       "nonqualified_plans_box11_usd": null
      },
      "has_state_taxes": false,
      "state_and_local_taxes": [],
      "has_special_box12_benefits": false,
      "box_12_benefits": [],
      "box_14_other": [],
      "is_statutory_employee": false,
      "has_retirement_plan": false,
      "has_third_party_sick_pay": false
     }
    ],
    "has_business_income": true
   },
   "income_foreign_source": {
    "foreign_wages": [],
    "foreign_interest_usd": 3133,
    "foreign_dividends_usd": 2651,
    "foreign_stcg_usd": 2169,
    "foreign_ltcg_usd": null,
    "foreign_rental_income_usd": 14458,
    "foreign_pension_income_usd": null,
    "section_988_gains_losses": []
   },
   "foreign_tax_credit_other": {
    "entries": []
   },
   "equity_compensation": {
    "has_equity_comp": false,
    "iso_exercises": [],
    "nso_exercises": [],
    "rsu_vestings": [],
    "espp_purchases": [],
    "unvested_restricted_stock_awards": []
   },
   "foreign_earned_income": {
    "claims_feie": true,
    "qualification_test": "physical_presence",
    "tax_home_country": "United States",
    "physical_presence_start_date": null,
    "physical_presence_end_date": null,
    "days_in_us_during_test_period": 345,
    "us_business_days": 0,
    "bona_fide_residence_start_date": null,
    "foreign_earned_income_usd": null,
    "feie_amount_claimed_usd": 0,
    "foreign_housing_expenses_usd": null,
    "housing_exclusion_base_usd": 21264,
    "housing_exclusion_cap_usd": 39870,
    "foreign_housing_exclusion_usd": 0,
    "bona_fide_residence": false,
    "physical_presence": false
   },
   "bank_accounts": [
    {
     "bank_name": "SBI (NRO)",
     "account_number_last_four": null,
     "account_type": "nro_savings",
     "country": "India",
     "peak_balance_usd": 31325,
     "last_day_balance_usd": null,
     "ownership_type": "individual",
     "joint_owner_count": null,
     "is_joint_owner_spouse": false,
     "owner_share_percent": null,
     "institution_address_street": null,
     "institution_address_city": null,
     "institution_address_zip": null,
     "opened_during_year": false,
     "closed_during_year": false
    },
    {
     "bank_name": "Axis (NRE)",
     "account_number_last_four": null,
     "account_type": "nre_savings",
     "country": "India",
     "peak_balance_usd": 22892,
     "last_day_balance_usd": null,
     "ownership_type": "individual",
     "joint_owner_count": null,
     "is_joint_owner_spouse": false,
     "owner_share_percent": null,
     "institution_address_street": null,
     "institution_address_city": null,
     "institution_address_zip": null,
     "opened_during_year": false,
     "closed_during_year": false
    }
   ],
   "fbar_aggregate_peak_usd": 54217,
   "form_8938_required": false,
   "financial_holdings": [
    {
     "asset_name": "Fidelity — Taxable Brokerage",
     "account_type": "taxable_brokerage",
     "peak_balance_usd": 224000,
     "country": "US"
    },
    {
     "asset_name": "Vanguard — VTSAX / VTI",
     "account_type": "taxable_brokerage",
     "peak_balance_usd": 141000,
     "country": "US"
    }
   ],
   "real_estate": {
    "has_real_estate_transaction": true,
    "properties": [
     {
      "name": "Rental condo — Jersey City, NJ",
      "property_description": "Rental condo — Jersey City, NJ",
      "transaction_type": "holding",
      "acquisition_date": null,
      "sale_date": null,
      "cost_basis_usd": null,
      "sale_price_usd": null,
      "realized_gain_loss_usd": 0,
      "s121_exclusion_claimed": false,
      "s1031_like_kind_exchange": false,
      "is_joint_owner_spouse": false,
      "owner_share_percent": null
     }
    ]
   },
   "retirement_accounts": {
    "traditional_ira_contribution_usd": null,
    "roth_ira_contribution_usd": 7000,
    "backdoor_roth_executed": false,
    "401k_employee_contribution_usd": 23000,
    "401k_employer_match_usd": 9500,
    "roth_401k_contribution_usd": null,
    "hsa_contribution_usd": 4150,
    "hsa_coverage_type": null,
    "solo_401k_contribution_usd": null,
    "sep_ira_contribution_usd": null,
    "rmd_required": false,
    "rmd_amount_usd": 0,
    "indian_epf_balance_usd": 0,
    "indian_ppf_balance_usd": 0,
    "indian_nps_balance_usd": null
   },
   "foreign_entities": {
    "owns_10_percent_foreign_corp": false,
    "foreign_corporations": [],
    "foreign_partnerships": [],
    "foreign_de_details": [],
    "pfic_holdings": [
     {
      "asset_name": "SBI Bluechip Fund",
      "holding_value_usd": 50602
     },
     {
      "asset_name": "Mirae Asset Large Cap",
      "holding_value_usd": 31325
     }
    ],
    "has_pfics": true
   },
   "foreign_gifts_and_trusts": {
    "received_foreign_gifts_above_100k": false,
    "foreign_gifts": [],
    "is_us_beneficiary_of_foreign_trust": false,
    "foreign_trust_details": [],
    "received_gift_from_covered_expatriate": false
   },
   "itemized_deductions_and_credits": {
    "use_standard_or_itemized": "auto",
    "state_and_local_taxes_paid_usd": null,
    "mortgage_interest_paid_usd": null,
    "mortgage_acquisition_date": null,
    "charitable_contributions_cash_usd": null,
    "charitable_contributions_appreciated_usd": null,
    "medical_expenses_usd": null,
    "casualty_loss_federal_disaster_usd": null,
    "hsa_contributions_usd": null,
    "student_loan_interest_usd": null,
    "educator_expenses_usd": null,
    "child_tax_credit_dependents": null,
    "credit_for_other_dependents": null,
    "child_and_dependent_care_expenses_usd": null,
    "education_credits_aotc_usd": null,
    "education_credits_llc_usd": null,
    "saver_credit_eligible": false,
    "funded_529_plan": false,
    "529_contributions_usd": null,
    "529_state_deduction_state": "",
    "qbi_deduction_eligible": false,
    "qbi_deduction_usd": 0
   },
   "amt_inputs": {
    "iso_preference_total_usd": 0,
    "salt_addback_usd": 0,
    "private_activity_bond_interest_usd": null,
    "amt_exemption_usd": 133000,
    "amti_usd": 329056.851,
    "tentative_minimum_tax_usd": 50974.78126000001,
    "amt_due_usd": 0,
    "minimum_tax_credit_carryforward_usd": null
   },
   "niit_inputs": {
    "modified_agi_usd": 329056.851,
    "niit_threshold_usd": 250000,
    "net_investment_income_usd": 73011,
    "niit_due_usd": 2774.418
   },
   "ftc_inputs": {
    "claims_ftc": true,
    "elect_accrued_method": false,
    "prior_year_carryovers_usd": 0,
    "ftc_baskets": []
   },
   "withholding_and_estimated": {
    "federal_withholding_total_usd": 30000,
    "state_withholding_total_usd": 0,
    "estimated_tax_q1_apr15_usd": null,
    "estimated_tax_q2_jun15_usd": null,
    "estimated_tax_q3_sep15_usd": null,
    "estimated_tax_q4_jan15_usd": null,
    "prior_year_total_tax_usd": null,
    "additional_medicare_tax_owed_usd": 0
   },
   "nra_specific": {
    "files_form_1040nr": false,
    "s6013h_joint_election": false,
    "w8ben_aggregate_status": "none",
    "form_w7_itin_application_filed": false,
    "spouse_ssn_or_itin_type": "none",
    "us_eci_income_usd": 220000,
    "us_fdap_income_usd": 38600,
    "treaty_rate_claims": [],
    "us_real_property_disposed": false,
    "firpta_withholding_usd": null,
    "is_lrs_investor": false
   },
   "metadata": {
    "us_calendar_year": 2026,
    "source": "onboarding",
    "input_completeness": "provisional",
    "schema_version": "layer1_us_v1",
    "obbba_threshold_table_version": "rev_proc_2025_32",
    "intake_completed": false,
    "intake_setup": {
     "setupW2": true,
     "setupBiz": true,
     "setupPassive": true,
     "setupProp": true,
     "setupEntities": false,
     "setupForeign": true,
     "setupRetirement": true,
     "setupEquity": false,
     "nested": {
      "foreignAssets": true,
      "foreignFeie": true,
      "foreignEntities": true,
      "foreignGifts": false,
      "passiveIntDiv": true,
      "passiveCapGains": true
     }
    }
   },
   "config": {
    "base_year": 2026
   }
  }
 },
 "c_priya_mehta": {
  "router": {
   "jurisdiction": "dual",
   "base_tax_year": 2026,
   "full_name": "Priya Mehta",
   "date_of_birth": "1987-07-14",
   "is_us_citizen": false,
   "has_green_card": true,
   "us_days": 350,
   "has_us_source_income_or_assets": true
  },
  "india": {
   "global_quarter": "Q1",
   "itr_recommendation": {
    "form": "ITR-2",
    "explanation": "For Individuals and HUFs not having business/profession income but having Capital Gains, Foreign Income/Assets, multiple properties, or otherwise not qualifying for ITR-1. (Disqualified from ITR-1 due to: Non-Resident / RNOR Status)"
   },
   "profile": {
    "full_name": "Priya Mehta",
    "entity_type": "individual",
    "date_of_birth": "1987-07-14",
    "pan": "BQXPM4411K",
    "pan_aadhaar_linked": true,
    "tax_regime": "NEW",
    "turnover_lte_400cr": false,
    "is_section_8": false,
    "mat_book_profit": null,
    "opt_115ba": false,
    "opt_115baa": false,
    "opt_115bab": false,
    "mfg_setup_date": null,
    "mfg_commence_date": null
   },
   "residency_detail": {
    "live_tracking_active": false,
    "trips": [
     {
      "arrival_date": null,
      "departure_date": null
     }
    ],
    "manual_days": 12,
    "india_work_days_current_year": 0,
    "is_wholly_outside_india": null,
    "is_indian_company": null,
    "is_poem_in_india": null,
    "days_in_india_current_year": 12,
    "days_in_india_preceding_4_years_gte_365": null,
    "employment_or_crew_status": null,
    "is_departure_year": null,
    "ship_nationality": null,
    "came_on_visit_to_india_pio_citizen": null,
    "nr_years_last_10_gte_9": null,
    "days_in_india_last_7_years_lte_729": null,
    "india_source_income_above_15l": null,
    "liable_to_tax_in_another_country_being_indian_citizen": false,
    "final_india_residency_status": "NR",
    "dtaa_worldwide_ceded": false
   },
   "company_residency": {
    "is_active_business": false,
    "board_meetings_primarily_outside_india": false,
    "key_management_location": "",
    "management_delegated_outside_india": false,
    "directors_in_india_count": 0,
    "directors_outside_india_count": 0
   },
   "dtaa": {
    "tax_residency_country": null,
    "is_us_resident_for_dtaa": null,
    "dtaa_treaty_residence": "none",
    "trc_status": false,
    "has_permanent_establishment_in_india": false,
    "treaty_elections": [],
    "mfn_clause_invoked": false,
    "dtaa_forced_nr": false
   },
   "compliance_docs": {
    "trc": {
     "validity_start_date": null,
     "validity_end_date": null,
     "document_uploaded": false
    },
    "form_10f": {
     "is_filed": false,
     "ack_number": null
    },
    "section_197_cert": {
     "is_available": false,
     "rate": null,
     "validity_start_date": null,
     "validity_end_date": null,
     "covered_income_types": null
    },
    "chapter_xiia_elected": false
   },
   "bank_accounts": [
    {
     "bank_name": "HDFC Bank (NRO)",
     "account_type": "nro",
     "peak_balance_inr": 1500000
    }
   ],
   "property": {
    "has_indian_property_transaction": false,
    "properties": []
   },
   "financial_holdings": {
    "has_financial_transactions": false,
    "transactions": []
   },
   "commodities": {
    "has_commodity_transactions": false,
    "transactions": []
   },
   "unlisted_equity": {
    "has_unlisted_equity_transaction": false,
    "transactions": []
   },
   "share_buyback": {
    "has_buyback_transaction": false,
    "transactions": []
   },
   "domestic_income": {
    "salary": {
     "has_salary_income": false,
     "taxable_salary_inr": null,
     "gross_salary_inr": null,
     "work_performed_outside_india": null,
     "workdays_in_india": null,
     "workdays_outside_india": null,
     "pwd_transport_allowance": {
      "is_eligible_pwd": false,
      "allowance_received_inr": null
     },
     "conveyance_allowance": {
      "allowance_received_inr": null,
      "actual_expenditure_inr": null
     },
     "tour_travel_allowance": {
      "allowance_received_inr": null,
      "actual_expenditure_inr": null
     },
     "daily_allowance": {
      "allowance_received_inr": null,
      "actual_expenditure_inr": null
     },
     "hra_received_inr": null,
     "rent_paid_inr": null,
     "is_metro_city": false,
     "basic_da_inr": null,
     "lta_claimed_inr": null,
     "perquisites_inr": null,
     "esop_perquisite_inr": null,
     "esop_perquisite_events": [],
     "professional_tax_inr": null,
     "employer_nps_contribution_inr": null,
     "prior_employer_salary_inr": null
    },
    "house_property": {
     "has_house_property_income": false,
     "properties": []
    },
    "business_income": {
     "has_business_or_fo_income": false,
     "entity_type": "individual",
     "nr_ineligible_presumptive": false,
     "nature_of_business": [],
     "business_code": null,
     "presumptive_scheme": [],
     "profession_type": null,
     "s115BAC_optout_history": false,
     "business_entries": [],
     "s44AD_last_exit_ay": null,
     "s44AD_opted_current_year": false,
     "goods_vehicles": [],
     "opening_stock_inr": null,
     "closing_stock_inr": null,
     "gst_registration_status": "unregistered",
     "gst_collected_inr": null,
     "expenses": {
      "rent_for_business_premises_inr": null,
      "repairs_maintenance_inr": null,
      "employee_salary_wages_inr": null,
      "employee_bonus_commission_inr": null,
      "interest_on_borrowed_capital_inr": null,
      "insurance_premium_inr": null,
      "bad_debts_written_off_inr": null,
      "other_business_expenses_inr": null,
      "total_cash_payments_exceeding_limit_inr": null,
      "cash_limit_type": "10k",
      "total_cash_payments_exceeding_35k_inr": null,
      "has_related_party_payments": false,
      "payments_to_non_residents_no_tds_inr": null,
      "payments_to_residents_no_tds_inr": null,
      "s35_own_revenue_research_inr": null,
      "s35_own_capital_research_inr": null,
      "s35_donation_to_approved_body_inr": null,
      "s35D_total_preliminary_expenses_inr": null,
      "s35D_year_of_commencement": null,
      "s35DDA_vrs_payments_inr": null,
      "s35DDA_first_year_of_payment": null,
      "stt_paid_inr": null,
      "ctt_paid_inr": null,
      "brokerage_on_fno_inr": null,
      "exchange_charges_inr": null,
      "advisory_and_data_subscriptions_inr": null,
      "internet_proportion_inr": null,
      "home_office_proportion_inr": null,
      "margin_interest_inr": null,
      "ca_professional_fees_inr": null,
      "employer_pf_esi_contribution_inr": null,
      "employer_pf_esi_paid_before_due_date": null
     },
     "asset_blocks": [],
     "speculative_income_inr": null,
     "speculative_turnover_inr": null,
     "non_speculative_income_inr": null,
     "fno_turnover_inr": null,
     "s41_remission_income_inr": null,
     "s41_bad_debt_recovery_inr": null,
     "partner_firms": [],
     "msme_payables": [],
     "amt_credit_bf_inr": null,
     "amt_credit_bf_origin_ay": null,
     "partner_remuneration_s40b_inr": null,
     "s44bbb_receipts_inr": null,
     "specified_business_s35AD_inr": null,
     "tonnage_tax_115V_inr": null,
     "has_business_income": false
    },
    "has_agricultural_income": false,
    "agricultural_income_inr": null,
    "capital_gains": {
     "short_term_15_pct": null
    },
    "other_sources": {
     "interest_inr": null
    },
    "has_salary": false,
    "has_house_property": false,
    "has_other_sources": true
   },
   "other_sources": {
    "has_other_sources_income": true,
    "quarters": {},
    "interest_savings_inr": null,
    "interest_fd_rd_inr": 120000,
    "interest_fd_rd_tds_inr": null,
    "interest_bonds_inr": null,
    "interest_bonds_tds_inr": null,
    "dividend_tds_inr": null,
    "lic_maturity_tds_inr": null,
    "interest_on_it_refund_inr": null,
    "dividend_inr": null,
    "gifts_above_50k_inr": null,
    "gifts_exemption_marriage": false,
    "gifts_exemption_relative": false,
    "family_pension_gross_inr": null,
    "family_pension_standard_deduction_inr": null,
    "winnings_lottery_gaming_inr": null,
    "online_gaming_winnings_inr": null,
    "deemed_dividend_from_buyback_inr": null,
    "exempt_interest_ppf_epf_inr": null,
    "taxable_epf_interest_inr": null,
    "exempt_nps_withdrawal_inr": null,
    "taxable_nps_withdrawal_inr": null,
    "exempt_pf_withdrawal_inr": null,
    "angel_tax_premium_inr": null,
    "lic_maturity_inr": null,
    "local_authority_s10_20_inr": null,
    "minor_child_exemption_inr": null,
    "spousal_clubbing_s64_inr": null,
    "miscellaneous_income_inr": null
   },
   "deductions": {
    "s80C": {
     "epf_employee_inr": null,
     "ppf_inr": null,
     "elss_inr": null,
     "life_insurance_premium_inr": null,
     "principal_home_loan_inr": null,
     "nsc_inr": null,
     "tuition_fees_inr": null,
     "sukanya_samriddhi_inr": null,
     "tax_saving_fd_inr": null,
     "stamp_duty_registration_inr": null
    },
    "s80CCC_80CCD1": {
     "lic_annuity_premium_inr": null,
     "nps_employee_contribution_inr": null
    },
    "s80CCD_1B": {
     "nps_additional_inr": null
    },
    "s80D": {
     "self_family_premium_inr": null,
     "self_family_preventive_checkup_inr": null,
     "parents_premium_inr": null,
     "parents_are_senior": false,
     "parents_preventive_checkup_inr": null,
     "parents_medical_expenditure_inr": null,
     "parents_has_health_insurance": true
    },
    "s80DD": {
     "has_disabled_dependents": false,
     "disability_percentage": null,
     "is_nri_blocked": true
    },
    "s80DDB": {
     "has_specified_diseases_treatment": false,
     "patient_category": null,
     "medical_expenses_inr": null,
     "is_nri_blocked": true
    },
    "s80U": {
     "has_self_disability": false,
     "disability_percentage": null,
     "is_nri_blocked": true
    },
    "s80G": [],
    "s80ggb_ggc_political_donation_inr": null,
    "s80GG": {
     "has_rent_paid_no_hra": false,
     "rent_paid_inr": null
    },
    "s80TTA_TTB": {
     "applicable_section": "80TTA",
     "savings_interest_inr": null,
     "fd_rd_interest_inr": null
    },
    "s80E": {
     "education_loan_interest_inr": null
    },
    "s80EEA_EE": {
     "affordable_home_loan_interest_inr": null,
     "loan_sanction_date": null
    },
    "s80M": {
     "dividend_income_inr": null,
     "dividend_distributed_inr": null
    },
    "special_entities": {}
   },
   "carry_forward_losses": {
    "has_brought_forward_losses": null,
    "business_loss_cf": [],
    "speculative_loss_cf": [],
    "stcg_loss_cf": [],
    "ltcg_loss_cf": [],
    "house_property_loss_cf": [],
    "unabsorbed_depreciation_cf": null,
    "unabsorbed_depreciation_attributable_to_additional_dep_inr": null,
    "s79_shareholding_change_triggered": false
   },
   "lrs_outbound": {
    "total_lrs_remitted_this_fy_inr": null,
    "lrs_purpose": null,
    "has_received_foreign_income": false
   },
   "tax_credits": {
    "advance_tax_q1_15jun_inr": null,
    "advance_tax_q2_15sep_inr": null,
    "advance_tax_q3_15dec_inr": null,
    "advance_tax_q4_15mar_inr": null,
    "tds_already_deducted_inr": 37440,
    "form_26as_uploaded": null,
    "foreign_tax_credit": [],
    "tcs_inr": null,
    "tds_inr": null
   },
   "surcharge_buckets": {
    "income_normal_slab_inr": null,
    "income_stcg_111A_inr": null,
    "income_ltcg_112A_inr": null,
    "income_ltcg_112_inr": null,
    "income_stcg_other_inr": null,
    "income_dividend_inr": null,
    "income_special_115BB_115BBJ_inr": null,
    "income_special_115A_inr": null
   },
   "nro_repatriation": {
    "cumulative_repatriated_usd_this_fy": null,
    "pending_repatriation_inr": null,
    "tds_deducted_on_nro_balance": false
   },
   "brought_forward_losses": {
    "s79_shareholding_change": null,
    "entries": []
   },
   "config": {
    "base_year": 2026
   },
   "advance_tax_simulator": {
    "enabled": false
   },
   "gift_received": {},
   "salary_exemptions": {},
   "other_exemptions": {},
   "capital_gains": {
    "has_capital_gains": false
   },
   "foreign_income": {},
   "foreign_assets": {
    "has_foreign_assets": null,
    "assets": []
   },
   "active_quarter": "Q1",
   "quarters": {
    "Q1": {
     "domestic_income": {
      "salary": {
       "has_salary_income": false,
       "taxable_salary_inr": null,
       "gross_salary_inr": null,
       "work_performed_outside_india": null,
       "workdays_in_india": null,
       "workdays_outside_india": null,
       "pwd_transport_allowance": {
        "is_eligible_pwd": false,
        "allowance_received_inr": null
       },
       "conveyance_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "tour_travel_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "daily_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "hra_received_inr": null,
       "rent_paid_inr": null,
       "is_metro_city": false,
       "basic_da_inr": null,
       "lta_claimed_inr": null,
       "perquisites_inr": null,
       "esop_perquisite_inr": null,
       "esop_perquisite_events": [],
       "professional_tax_inr": null,
       "employer_nps_contribution_inr": null,
       "prior_employer_salary_inr": null
      },
      "house_property": {
       "has_house_property_income": false,
       "properties": []
      },
      "business_income": {
       "has_business_or_fo_income": false,
       "entity_type": "individual",
       "nr_ineligible_presumptive": false,
       "nature_of_business": [],
       "business_code": null,
       "presumptive_scheme": [],
       "profession_type": null,
       "s115BAC_optout_history": false,
       "business_entries": [],
       "s44AD_last_exit_ay": null,
       "s44AD_opted_current_year": false,
       "goods_vehicles": [],
       "opening_stock_inr": null,
       "closing_stock_inr": null,
       "gst_registration_status": "unregistered",
       "gst_collected_inr": null,
       "expenses": {
        "rent_for_business_premises_inr": null,
        "repairs_maintenance_inr": null,
        "employee_salary_wages_inr": null,
        "employee_bonus_commission_inr": null,
        "interest_on_borrowed_capital_inr": null,
        "insurance_premium_inr": null,
        "bad_debts_written_off_inr": null,
        "other_business_expenses_inr": null,
        "total_cash_payments_exceeding_limit_inr": null,
        "cash_limit_type": "10k",
        "total_cash_payments_exceeding_35k_inr": null,
        "has_related_party_payments": false,
        "payments_to_non_residents_no_tds_inr": null,
        "payments_to_residents_no_tds_inr": null,
        "s35_own_revenue_research_inr": null,
        "s35_own_capital_research_inr": null,
        "s35_donation_to_approved_body_inr": null,
        "s35D_total_preliminary_expenses_inr": null,
        "s35D_year_of_commencement": null,
        "s35DDA_vrs_payments_inr": null,
        "s35DDA_first_year_of_payment": null,
        "stt_paid_inr": null,
        "ctt_paid_inr": null,
        "brokerage_on_fno_inr": null,
        "exchange_charges_inr": null,
        "advisory_and_data_subscriptions_inr": null,
        "internet_proportion_inr": null,
        "home_office_proportion_inr": null,
        "margin_interest_inr": null,
        "ca_professional_fees_inr": null,
        "employer_pf_esi_contribution_inr": null,
        "employer_pf_esi_paid_before_due_date": null
       },
       "asset_blocks": [],
       "speculative_income_inr": null,
       "speculative_turnover_inr": null,
       "non_speculative_income_inr": null,
       "fno_turnover_inr": null,
       "s41_remission_income_inr": null,
       "s41_bad_debt_recovery_inr": null,
       "partner_firms": [],
       "msme_payables": [],
       "amt_credit_bf_inr": null,
       "amt_credit_bf_origin_ay": null,
       "partner_remuneration_s40b_inr": null,
       "s44bbb_receipts_inr": null,
       "specified_business_s35AD_inr": null,
       "tonnage_tax_115V_inr": null,
       "has_business_income": false
      },
      "has_agricultural_income": false,
      "agricultural_income_inr": null,
      "capital_gains": {
       "short_term_15_pct": null
      },
      "other_sources": {
       "interest_inr": null
      },
      "has_salary": false,
      "has_house_property": false,
      "has_other_sources": true
     },
     "other_sources": {
      "has_other_sources_income": true,
      "quarters": {},
      "interest_savings_inr": null,
      "interest_fd_rd_inr": 120000,
      "interest_fd_rd_tds_inr": null,
      "interest_bonds_inr": null,
      "interest_bonds_tds_inr": null,
      "dividend_tds_inr": null,
      "lic_maturity_tds_inr": null,
      "interest_on_it_refund_inr": null,
      "dividend_inr": null,
      "gifts_above_50k_inr": null,
      "gifts_exemption_marriage": false,
      "gifts_exemption_relative": false,
      "family_pension_gross_inr": null,
      "family_pension_standard_deduction_inr": null,
      "winnings_lottery_gaming_inr": null,
      "online_gaming_winnings_inr": null,
      "deemed_dividend_from_buyback_inr": null,
      "exempt_interest_ppf_epf_inr": null,
      "taxable_epf_interest_inr": null,
      "exempt_nps_withdrawal_inr": null,
      "taxable_nps_withdrawal_inr": null,
      "exempt_pf_withdrawal_inr": null,
      "angel_tax_premium_inr": null,
      "lic_maturity_inr": null,
      "local_authority_s10_20_inr": null,
      "minor_child_exemption_inr": null,
      "spousal_clubbing_s64_inr": null,
      "miscellaneous_income_inr": null
     },
     "lrs_outbound": {
      "total_lrs_remitted_this_fy_inr": null,
      "lrs_purpose": null,
      "has_received_foreign_income": null
     },
     "nro_repatriation": {
      "cumulative_repatriated_usd_this_fy": null,
      "pending_repatriation_inr": null,
      "tds_deducted_on_nro_balance": false
     },
     "capital_gains": {
      "has_capital_gains": false
     },
     "financial_holdings": {
      "has_financial_transactions": false,
      "transactions": []
     },
     "commodities": {
      "has_commodity_transactions": false,
      "transactions": []
     },
     "unlisted_equity": {
      "has_unlisted_equity_transaction": false,
      "transactions": []
     },
     "property": {
      "has_indian_property_transaction": false,
      "properties": []
     }
    },
    "Q2": {
     "domestic_income": {
      "salary": {
       "has_salary_income": false,
       "taxable_salary_inr": null,
       "gross_salary_inr": null,
       "work_performed_outside_india": null,
       "workdays_in_india": null,
       "workdays_outside_india": null,
       "pwd_transport_allowance": {
        "is_eligible_pwd": false,
        "allowance_received_inr": null
       },
       "conveyance_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "tour_travel_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "daily_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "hra_received_inr": null,
       "rent_paid_inr": null,
       "is_metro_city": false,
       "basic_da_inr": null,
       "lta_claimed_inr": null,
       "perquisites_inr": null,
       "esop_perquisite_inr": null,
       "esop_perquisite_events": [],
       "professional_tax_inr": null,
       "employer_nps_contribution_inr": null,
       "prior_employer_salary_inr": null
      },
      "house_property": {
       "has_house_property_income": false,
       "properties": []
      },
      "business_income": {
       "has_business_or_fo_income": false,
       "entity_type": "individual",
       "nr_ineligible_presumptive": false,
       "nature_of_business": [],
       "business_code": null,
       "presumptive_scheme": [],
       "profession_type": null,
       "s115BAC_optout_history": false,
       "business_entries": [],
       "s44AD_last_exit_ay": null,
       "s44AD_opted_current_year": false,
       "goods_vehicles": [],
       "opening_stock_inr": null,
       "closing_stock_inr": null,
       "gst_registration_status": "unregistered",
       "gst_collected_inr": null,
       "expenses": {
        "rent_for_business_premises_inr": null,
        "repairs_maintenance_inr": null,
        "employee_salary_wages_inr": null,
        "employee_bonus_commission_inr": null,
        "interest_on_borrowed_capital_inr": null,
        "insurance_premium_inr": null,
        "bad_debts_written_off_inr": null,
        "other_business_expenses_inr": null,
        "total_cash_payments_exceeding_limit_inr": null,
        "cash_limit_type": "10k",
        "total_cash_payments_exceeding_35k_inr": null,
        "has_related_party_payments": false,
        "payments_to_non_residents_no_tds_inr": null,
        "payments_to_residents_no_tds_inr": null,
        "s35_own_revenue_research_inr": null,
        "s35_own_capital_research_inr": null,
        "s35_donation_to_approved_body_inr": null,
        "s35D_total_preliminary_expenses_inr": null,
        "s35D_year_of_commencement": null,
        "s35DDA_vrs_payments_inr": null,
        "s35DDA_first_year_of_payment": null,
        "stt_paid_inr": null,
        "ctt_paid_inr": null,
        "brokerage_on_fno_inr": null,
        "exchange_charges_inr": null,
        "advisory_and_data_subscriptions_inr": null,
        "internet_proportion_inr": null,
        "home_office_proportion_inr": null,
        "margin_interest_inr": null,
        "ca_professional_fees_inr": null,
        "employer_pf_esi_contribution_inr": null,
        "employer_pf_esi_paid_before_due_date": null
       },
       "asset_blocks": [],
       "speculative_income_inr": null,
       "speculative_turnover_inr": null,
       "non_speculative_income_inr": null,
       "fno_turnover_inr": null,
       "s41_remission_income_inr": null,
       "s41_bad_debt_recovery_inr": null,
       "partner_firms": [],
       "msme_payables": [],
       "amt_credit_bf_inr": null,
       "amt_credit_bf_origin_ay": null,
       "partner_remuneration_s40b_inr": null,
       "s44bbb_receipts_inr": null,
       "specified_business_s35AD_inr": null,
       "tonnage_tax_115V_inr": null
      },
      "has_agricultural_income": false,
      "agricultural_income_inr": null,
      "capital_gains": {
       "short_term_15_pct": null
      },
      "other_sources": {
       "interest_inr": null
      }
     },
     "other_sources": {
      "has_other_sources_income": false,
      "quarters": {},
      "interest_savings_inr": null,
      "interest_fd_rd_inr": null,
      "interest_fd_rd_tds_inr": null,
      "interest_bonds_inr": null,
      "interest_bonds_tds_inr": null,
      "dividend_tds_inr": null,
      "lic_maturity_tds_inr": null,
      "interest_on_it_refund_inr": null,
      "dividend_inr": null,
      "gifts_above_50k_inr": null,
      "gifts_exemption_marriage": false,
      "gifts_exemption_relative": false,
      "family_pension_gross_inr": null,
      "family_pension_standard_deduction_inr": null,
      "winnings_lottery_gaming_inr": null,
      "online_gaming_winnings_inr": null,
      "deemed_dividend_from_buyback_inr": null,
      "exempt_interest_ppf_epf_inr": null,
      "taxable_epf_interest_inr": null,
      "exempt_nps_withdrawal_inr": null,
      "taxable_nps_withdrawal_inr": null,
      "exempt_pf_withdrawal_inr": null,
      "angel_tax_premium_inr": null,
      "lic_maturity_inr": null,
      "local_authority_s10_20_inr": null,
      "minor_child_exemption_inr": null,
      "spousal_clubbing_s64_inr": null,
      "miscellaneous_income_inr": null
     },
     "lrs_outbound": {
      "total_lrs_remitted_this_fy_inr": null,
      "lrs_purpose": null,
      "has_received_foreign_income": false
     },
     "nro_repatriation": {
      "cumulative_repatriated_usd_this_fy": null,
      "pending_repatriation_inr": null,
      "tds_deducted_on_nro_balance": false
     },
     "capital_gains": {},
     "financial_holdings": {
      "has_financial_transactions": false,
      "transactions": []
     },
     "commodities": {
      "has_commodity_transactions": false,
      "transactions": []
     },
     "unlisted_equity": {
      "has_unlisted_equity_transaction": false,
      "transactions": []
     },
     "property": {
      "has_indian_property_transaction": false,
      "properties": []
     }
    },
    "Q3": {
     "domestic_income": {
      "salary": {
       "has_salary_income": false,
       "taxable_salary_inr": null,
       "gross_salary_inr": null,
       "work_performed_outside_india": null,
       "workdays_in_india": null,
       "workdays_outside_india": null,
       "pwd_transport_allowance": {
        "is_eligible_pwd": false,
        "allowance_received_inr": null
       },
       "conveyance_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "tour_travel_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "daily_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "hra_received_inr": null,
       "rent_paid_inr": null,
       "is_metro_city": false,
       "basic_da_inr": null,
       "lta_claimed_inr": null,
       "perquisites_inr": null,
       "esop_perquisite_inr": null,
       "esop_perquisite_events": [],
       "professional_tax_inr": null,
       "employer_nps_contribution_inr": null,
       "prior_employer_salary_inr": null
      },
      "house_property": {
       "has_house_property_income": false,
       "properties": []
      },
      "business_income": {
       "has_business_or_fo_income": false,
       "entity_type": "individual",
       "nr_ineligible_presumptive": false,
       "nature_of_business": [],
       "business_code": null,
       "presumptive_scheme": [],
       "profession_type": null,
       "s115BAC_optout_history": false,
       "business_entries": [],
       "s44AD_last_exit_ay": null,
       "s44AD_opted_current_year": false,
       "goods_vehicles": [],
       "opening_stock_inr": null,
       "closing_stock_inr": null,
       "gst_registration_status": "unregistered",
       "gst_collected_inr": null,
       "expenses": {
        "rent_for_business_premises_inr": null,
        "repairs_maintenance_inr": null,
        "employee_salary_wages_inr": null,
        "employee_bonus_commission_inr": null,
        "interest_on_borrowed_capital_inr": null,
        "insurance_premium_inr": null,
        "bad_debts_written_off_inr": null,
        "other_business_expenses_inr": null,
        "total_cash_payments_exceeding_limit_inr": null,
        "cash_limit_type": "10k",
        "total_cash_payments_exceeding_35k_inr": null,
        "has_related_party_payments": false,
        "payments_to_non_residents_no_tds_inr": null,
        "payments_to_residents_no_tds_inr": null,
        "s35_own_revenue_research_inr": null,
        "s35_own_capital_research_inr": null,
        "s35_donation_to_approved_body_inr": null,
        "s35D_total_preliminary_expenses_inr": null,
        "s35D_year_of_commencement": null,
        "s35DDA_vrs_payments_inr": null,
        "s35DDA_first_year_of_payment": null,
        "stt_paid_inr": null,
        "ctt_paid_inr": null,
        "brokerage_on_fno_inr": null,
        "exchange_charges_inr": null,
        "advisory_and_data_subscriptions_inr": null,
        "internet_proportion_inr": null,
        "home_office_proportion_inr": null,
        "margin_interest_inr": null,
        "ca_professional_fees_inr": null,
        "employer_pf_esi_contribution_inr": null,
        "employer_pf_esi_paid_before_due_date": null
       },
       "asset_blocks": [],
       "speculative_income_inr": null,
       "speculative_turnover_inr": null,
       "non_speculative_income_inr": null,
       "fno_turnover_inr": null,
       "s41_remission_income_inr": null,
       "s41_bad_debt_recovery_inr": null,
       "partner_firms": [],
       "msme_payables": [],
       "amt_credit_bf_inr": null,
       "amt_credit_bf_origin_ay": null,
       "partner_remuneration_s40b_inr": null,
       "s44bbb_receipts_inr": null,
       "specified_business_s35AD_inr": null,
       "tonnage_tax_115V_inr": null
      },
      "has_agricultural_income": false,
      "agricultural_income_inr": null,
      "capital_gains": {
       "short_term_15_pct": null
      },
      "other_sources": {
       "interest_inr": null
      }
     },
     "other_sources": {
      "has_other_sources_income": false,
      "quarters": {},
      "interest_savings_inr": null,
      "interest_fd_rd_inr": null,
      "interest_fd_rd_tds_inr": null,
      "interest_bonds_inr": null,
      "interest_bonds_tds_inr": null,
      "dividend_tds_inr": null,
      "lic_maturity_tds_inr": null,
      "interest_on_it_refund_inr": null,
      "dividend_inr": null,
      "gifts_above_50k_inr": null,
      "gifts_exemption_marriage": false,
      "gifts_exemption_relative": false,
      "family_pension_gross_inr": null,
      "family_pension_standard_deduction_inr": null,
      "winnings_lottery_gaming_inr": null,
      "online_gaming_winnings_inr": null,
      "deemed_dividend_from_buyback_inr": null,
      "exempt_interest_ppf_epf_inr": null,
      "taxable_epf_interest_inr": null,
      "exempt_nps_withdrawal_inr": null,
      "taxable_nps_withdrawal_inr": null,
      "exempt_pf_withdrawal_inr": null,
      "angel_tax_premium_inr": null,
      "lic_maturity_inr": null,
      "local_authority_s10_20_inr": null,
      "minor_child_exemption_inr": null,
      "spousal_clubbing_s64_inr": null,
      "miscellaneous_income_inr": null
     },
     "lrs_outbound": {
      "total_lrs_remitted_this_fy_inr": null,
      "lrs_purpose": null,
      "has_received_foreign_income": false
     },
     "nro_repatriation": {
      "cumulative_repatriated_usd_this_fy": null,
      "pending_repatriation_inr": null,
      "tds_deducted_on_nro_balance": false
     },
     "capital_gains": {},
     "financial_holdings": {
      "has_financial_transactions": false,
      "transactions": []
     },
     "commodities": {
      "has_commodity_transactions": false,
      "transactions": []
     },
     "unlisted_equity": {
      "has_unlisted_equity_transaction": false,
      "transactions": []
     },
     "property": {
      "has_indian_property_transaction": false,
      "properties": []
     }
    },
    "Q4": {
     "domestic_income": {
      "salary": {
       "has_salary_income": false,
       "taxable_salary_inr": null,
       "gross_salary_inr": null,
       "work_performed_outside_india": null,
       "workdays_in_india": null,
       "workdays_outside_india": null,
       "pwd_transport_allowance": {
        "is_eligible_pwd": false,
        "allowance_received_inr": null
       },
       "conveyance_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "tour_travel_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "daily_allowance": {
        "allowance_received_inr": null,
        "actual_expenditure_inr": null
       },
       "hra_received_inr": null,
       "rent_paid_inr": null,
       "is_metro_city": false,
       "basic_da_inr": null,
       "lta_claimed_inr": null,
       "perquisites_inr": null,
       "esop_perquisite_inr": null,
       "esop_perquisite_events": [],
       "professional_tax_inr": null,
       "employer_nps_contribution_inr": null,
       "prior_employer_salary_inr": null
      },
      "house_property": {
       "has_house_property_income": false,
       "properties": []
      },
      "business_income": {
       "has_business_or_fo_income": false,
       "entity_type": "individual",
       "nr_ineligible_presumptive": false,
       "nature_of_business": [],
       "business_code": null,
       "presumptive_scheme": [],
       "profession_type": null,
       "s115BAC_optout_history": false,
       "business_entries": [],
       "s44AD_last_exit_ay": null,
       "s44AD_opted_current_year": false,
       "goods_vehicles": [],
       "opening_stock_inr": null,
       "closing_stock_inr": null,
       "gst_registration_status": "unregistered",
       "gst_collected_inr": null,
       "expenses": {
        "rent_for_business_premises_inr": null,
        "repairs_maintenance_inr": null,
        "employee_salary_wages_inr": null,
        "employee_bonus_commission_inr": null,
        "interest_on_borrowed_capital_inr": null,
        "insurance_premium_inr": null,
        "bad_debts_written_off_inr": null,
        "other_business_expenses_inr": null,
        "total_cash_payments_exceeding_limit_inr": null,
        "cash_limit_type": "10k",
        "total_cash_payments_exceeding_35k_inr": null,
        "has_related_party_payments": false,
        "payments_to_non_residents_no_tds_inr": null,
        "payments_to_residents_no_tds_inr": null,
        "s35_own_revenue_research_inr": null,
        "s35_own_capital_research_inr": null,
        "s35_donation_to_approved_body_inr": null,
        "s35D_total_preliminary_expenses_inr": null,
        "s35D_year_of_commencement": null,
        "s35DDA_vrs_payments_inr": null,
        "s35DDA_first_year_of_payment": null,
        "stt_paid_inr": null,
        "ctt_paid_inr": null,
        "brokerage_on_fno_inr": null,
        "exchange_charges_inr": null,
        "advisory_and_data_subscriptions_inr": null,
        "internet_proportion_inr": null,
        "home_office_proportion_inr": null,
        "margin_interest_inr": null,
        "ca_professional_fees_inr": null,
        "employer_pf_esi_contribution_inr": null,
        "employer_pf_esi_paid_before_due_date": null
       },
       "asset_blocks": [],
       "speculative_income_inr": null,
       "speculative_turnover_inr": null,
       "non_speculative_income_inr": null,
       "fno_turnover_inr": null,
       "s41_remission_income_inr": null,
       "s41_bad_debt_recovery_inr": null,
       "partner_firms": [],
       "msme_payables": [],
       "amt_credit_bf_inr": null,
       "amt_credit_bf_origin_ay": null,
       "partner_remuneration_s40b_inr": null,
       "s44bbb_receipts_inr": null,
       "specified_business_s35AD_inr": null,
       "tonnage_tax_115V_inr": null
      },
      "has_agricultural_income": false,
      "agricultural_income_inr": null,
      "capital_gains": {
       "short_term_15_pct": null
      },
      "other_sources": {
       "interest_inr": null
      }
     },
     "other_sources": {
      "has_other_sources_income": false,
      "quarters": {},
      "interest_savings_inr": null,
      "interest_fd_rd_inr": null,
      "interest_fd_rd_tds_inr": null,
      "interest_bonds_inr": null,
      "interest_bonds_tds_inr": null,
      "dividend_tds_inr": null,
      "lic_maturity_tds_inr": null,
      "interest_on_it_refund_inr": null,
      "dividend_inr": null,
      "gifts_above_50k_inr": null,
      "gifts_exemption_marriage": false,
      "gifts_exemption_relative": false,
      "family_pension_gross_inr": null,
      "family_pension_standard_deduction_inr": null,
      "winnings_lottery_gaming_inr": null,
      "online_gaming_winnings_inr": null,
      "deemed_dividend_from_buyback_inr": null,
      "exempt_interest_ppf_epf_inr": null,
      "taxable_epf_interest_inr": null,
      "exempt_nps_withdrawal_inr": null,
      "taxable_nps_withdrawal_inr": null,
      "exempt_pf_withdrawal_inr": null,
      "angel_tax_premium_inr": null,
      "lic_maturity_inr": null,
      "local_authority_s10_20_inr": null,
      "minor_child_exemption_inr": null,
      "spousal_clubbing_s64_inr": null,
      "miscellaneous_income_inr": null
     },
     "lrs_outbound": {
      "total_lrs_remitted_this_fy_inr": null,
      "lrs_purpose": null,
      "has_received_foreign_income": false
     },
     "nro_repatriation": {
      "cumulative_repatriated_usd_this_fy": null,
      "pending_repatriation_inr": null,
      "tds_deducted_on_nro_balance": false
     },
     "capital_gains": {},
     "financial_holdings": {
      "has_financial_transactions": false,
      "transactions": []
     },
     "commodities": {
      "has_commodity_transactions": false,
      "transactions": []
     },
     "unlisted_equity": {
      "has_unlisted_equity_transaction": false,
      "transactions": []
     },
     "property": {
      "has_indian_property_transaction": false,
      "properties": []
     }
    }
   },
   "metadata": {
    "financial_year": "TY2026-27",
    "schema_version": "layer1_india_v5_1"
   }
  },
  "us": {
   "profile": {
    "tax_entity_type": "individual",
    "llc_tax_election": "individual",
    "incorporation_state": null,
    "incorporated_in_us": null,
    "full_name": "Priya Mehta",
    "date_of_birth": "1987-07-14",
    "filing_status": "mfj",
    "ssn_or_itin": null,
    "ssn_or_itin_type": "ssn",
    "dependents_count": 0,
    "spouse_is_us_person": true,
    "is_blind": false,
    "spouse_client_id": "c_rohan_mehta",
    "household_items_owner": "spouse",
    "spouse_has_income_or_filings": "yes",
    "spouse_full_name": null,
    "spouse_ssn_or_itin_type": null,
    "spouse_date_of_birth": null,
    "spouse_residency_status": null,
    "spouse_is_blind": false,
    "trump_accounts_opened": false,
    "trump_accounts_children": [],
    "trump_accounts_num_children": 0,
    "trump_accounts_children_born_2025_2028": 0,
    "trump_accounts_total_contributions_usd": 0,
    "trust_retained_income_usd": 0
   },
   "corporate_profile": {
    "entity_name": null,
    "ein": null,
    "date_of_incorporation": null,
    "state_of_domicile": null,
    "naics_code": null,
    "fiscal_year_end": "12-31",
    "is_foreign_owned_25_pct": false,
    "is_foreign_corporation": false
   },
   "corporate_international": {
    "fdii_eligible_income": null,
    "ncti_tested_income": null,
    "form_5472_related_parties": []
   },
   "corporate_financials": {
    "schedule_l": {
     "assets_beginning": 0,
     "assets_ending": 0,
     "liabilities_beginning": 0,
     "liabilities_ending": 0,
     "equity_beginning": 0,
     "equity_ending": 0
    },
    "schedule_m1": {
     "net_income_per_books": 0,
     "federal_tax_expense": 0,
     "meals_disallowed_50": 0,
     "tax_depreciation_over_book": 0,
     "taxable_income": 0
    },
    "schedule_m2": {
     "retained_earnings_beginning": 0,
     "distributions_dividends_paid": 0,
     "retained_earnings_ending": 0
    }
   },
   "us_residency_detail": {
    "is_us_citizen": false,
    "has_green_card": true,
    "green_card_grant_date": null,
    "i407_surrendered_date": null,
    "green_card_years_held": 0,
    "expatriation_net_worth_usd": 0,
    "expatriation_avg_net_income_tax_usd": 0,
    "form_8854_5yr_compliance_certified": false,
    "us_days_current_year": 350,
    "us_days_minus_1_year": 0,
    "us_days_minus_2_years": 0,
    "exempt_individual_status": "none",
    "exempt_first_year": null,
    "exempt_prior_years_count": 0,
    "exempt_student_closer_conn_exception": false,
    "exempt_scholar_lookback_exception": false,
    "closer_connection_claim": null,
    "first_year_choice_election": false,
    "first_year_choice_entry_date": null,
    "s6013g_joint_election": false,
    "spt_day_count_weighted": 350,
    "spt_test_met": true,
    "final_us_residency_status": "RESIDENT_ALIEN",
    "dtaa_treaty_residence": "none",
    "residency_start_date": "2026-01-01",
    "residency_end_date": "2026-12-31"
   },
   "corp_state_nexus": {
    "physical_states": [],
    "economic_states": [],
    "needs_apportionment": false,
    "apportionment_factors": {},
    "has_remote_workers": false
   },
   "state_residency": {
    "jan_1_domicile_state": "",
    "dec_31_domicile_state": "",
    "total_states_footprint": [],
    "primary_state_of_residence": "NY",
    "moved_states_this_year": false,
    "previous_state": "",
    "move_date": null,
    "state_days_in_current_state": null,
    "dependents_school_state": "",
    "primary_bank_and_medical_nexus_state": "",
    "vehicles_registered_state": "",
    "active_duty_military_or_spouse": false,
    "military_home_state_of_record": "",
    "military_duty_station_state": "",
    "ca_planning_departure": false,
    "ca_retains_property_or_voter_reg": false,
    "footprint_details": {}
   },
   "income_us_source": {
    "has_employment_income": true,
    "has_capital_gains": false,
    "has_crypto": false,
    "stocks_needs_wash_sale_reconciliation": false,
    "crypto_needs_wash_sale": false,
    "has_sec_1256": false,
    "has_qof_rollover": false,
    "has_qsbs": false,
    "has_real_estate": false,
    "has_1031_exchange": false,
    "has_installment_sale": false,
    "has_collectibles": false,
    "has_capital_loss_carryovers": false,
    "st_loss_carryover_usd": null,
    "lt_loss_carryover_usd": null,
    "self_employment": [],
    "partnerships_k1": [],
    "s_corporations_k1": [],
    "c_corporations_1120": [],
    "farming_schedule_f": [],
    "trusts_estates_k1": [],
    "se_health_insurance_deduction_usd": null,
    "se_retirement_deduction_usd": null,
    "cg_manual_st_proceeds_usd": null,
    "cg_manual_st_basis_usd": null,
    "cg_manual_lt_proceeds_usd": null,
    "cg_manual_lt_basis_usd": null,
    "cg_manual_stcg_usd": null,
    "cg_manual_ltcg_usd": null,
    "royalty_income_us_source_usd": null,
    "k1_passthrough_income_usd": null,
    "ira_distributions_usd": null,
    "401k_distributions_usd": null,
    "crypto_transactions": [],
    "wages_w2": [
     {
      "id": "w2-1790777174560y2f",
      "employer_name": "Mount Sinai Health System",
      "employer_street": null,
      "employer_city": null,
      "employer_state": null,
      "employer_zip": null,
      "wages_box1_usd": 90000,
      "qualified_tip_income_usd": null,
      "qualified_overtime_premium_usd": null,
      "workdays_in_us": null,
      "workdays_outside_us": null,
      "tax_details_collapsed_by_default": {
       "employer_ein": null,
       "control_number": null,
       "federal_tax_withheld_usd": 11000,
       "ss_wages_box3_usd": null,
       "ss_tax_withheld_usd": null,
       "medicare_wages_box5_usd": 98000,
       "medicare_tax_withheld_usd": null,
       "ss_tips_box7_usd": null,
       "allocated_tips_box8_usd": null,
       "dependent_care_benefits_box10_usd": null,
       "nonqualified_plans_box11_usd": null
      },
      "has_state_taxes": false,
      "state_and_local_taxes": [],
      "has_special_box12_benefits": false,
      "box_12_benefits": [],
      "box_14_other": [],
      "is_statutory_employee": false,
      "has_retirement_plan": false,
      "has_third_party_sick_pay": false
     }
    ],
    "has_business_income": false
   },
   "income_foreign_source": {
    "foreign_wages": [],
    "foreign_interest_usd": 1446,
    "foreign_dividends_usd": null,
    "foreign_stcg_usd": null,
    "foreign_ltcg_usd": null,
    "foreign_rental_income_usd": null,
    "foreign_pension_income_usd": null,
    "section_988_gains_losses": []
   },
   "foreign_tax_credit_other": {
    "entries": []
   },
   "equity_compensation": {
    "has_equity_comp": false,
    "iso_exercises": [],
    "nso_exercises": [],
    "rsu_vestings": [],
    "espp_purchases": [],
    "unvested_restricted_stock_awards": []
   },
   "foreign_earned_income": {
    "claims_feie": false,
    "qualification_test": "physical_presence",
    "tax_home_country": "",
    "physical_presence_start_date": null,
    "physical_presence_end_date": null,
    "days_in_us_during_test_period": 0,
    "us_business_days": 0,
    "bona_fide_residence_start_date": null,
    "foreign_earned_income_usd": null,
    "feie_amount_claimed_usd": 0,
    "foreign_housing_expenses_usd": null,
    "housing_exclusion_base_usd": 21264,
    "housing_exclusion_cap_usd": 39870,
    "foreign_housing_exclusion_usd": 0
   },
   "bank_accounts": [
    {
     "bank_name": "HDFC Bank (NRO)",
     "account_number_last_four": "7788",
     "account_type": "nro_savings",
     "country": "India",
     "peak_balance_usd": 18072,
     "last_day_balance_usd": null,
     "ownership_type": "individual",
     "joint_owner_count": null,
     "is_joint_owner_spouse": false,
     "owner_share_percent": null,
     "institution_address_street": null,
     "institution_address_city": null,
     "institution_address_zip": null,
     "opened_during_year": false,
     "closed_during_year": false
    }
   ],
   "fbar_aggregate_peak_usd": 18072,
   "form_8938_required": false,
   "financial_holdings": [],
   "real_estate": {
    "has_real_estate_transaction": false,
    "properties": []
   },
   "retirement_accounts": {
    "traditional_ira_contribution_usd": null,
    "roth_ira_contribution_usd": null,
    "backdoor_roth_executed": false,
    "401k_employee_contribution_usd": 8000,
    "401k_employer_match_usd": null,
    "roth_401k_contribution_usd": null,
    "hsa_contribution_usd": null,
    "hsa_coverage_type": null,
    "solo_401k_contribution_usd": null,
    "sep_ira_contribution_usd": null,
    "rmd_required": false,
    "rmd_amount_usd": 0,
    "indian_epf_balance_usd": 0,
    "indian_ppf_balance_usd": 0,
    "indian_nps_balance_usd": null
   },
   "foreign_entities": {
    "owns_10_percent_foreign_corp": false,
    "foreign_corporations": [],
    "owns_10_percent_foreign_partnership": false,
    "foreign_partnerships": [],
    "owns_foreign_disregarded_entity": false,
    "foreign_de_details": [],
    "pfic_holdings": []
   },
   "foreign_gifts_and_trusts": {
    "received_foreign_gifts_above_100k": false,
    "foreign_gifts": [],
    "is_us_beneficiary_of_foreign_trust": false,
    "foreign_trust_details": [],
    "received_gift_from_covered_expatriate": false
   },
   "itemized_deductions_and_credits": {
    "use_standard_or_itemized": "auto",
    "state_and_local_taxes_paid_usd": null,
    "mortgage_interest_paid_usd": null,
    "mortgage_acquisition_date": null,
    "charitable_contributions_cash_usd": null,
    "charitable_contributions_appreciated_usd": null,
    "medical_expenses_usd": null,
    "casualty_loss_federal_disaster_usd": null,
    "hsa_contributions_usd": null,
    "student_loan_interest_usd": null,
    "educator_expenses_usd": null,
    "child_tax_credit_dependents": null,
    "credit_for_other_dependents": null,
    "child_and_dependent_care_expenses_usd": null,
    "education_credits_aotc_usd": null,
    "education_credits_llc_usd": null,
    "saver_credit_eligible": false,
    "funded_529_plan": false,
    "529_contributions_usd": null,
    "529_state_deduction_state": "",
    "qbi_deduction_eligible": false,
    "qbi_deduction_usd": 0
   },
   "amt_inputs": {
    "iso_preference_total_usd": 0,
    "salt_addback_usd": 0,
    "private_activity_bond_interest_usd": null,
    "amt_exemption_usd": 133000,
    "amti_usd": 91446,
    "tentative_minimum_tax_usd": 0,
    "amt_due_usd": 0,
    "minimum_tax_credit_carryforward_usd": null
   },
   "niit_inputs": {
    "modified_agi_usd": 91446,
    "niit_threshold_usd": 250000,
    "net_investment_income_usd": 1446,
    "niit_due_usd": 0
   },
   "ftc_inputs": {
    "claims_ftc": false,
    "claims_ftc_simplified_under_300": false,
    "elect_accrued_method": false,
    "prior_year_carryovers_usd": 0,
    "ftc_baskets": []
   },
   "withholding_and_estimated": {
    "federal_withholding_total_usd": 11000,
    "state_withholding_total_usd": 0,
    "estimated_tax_q1_apr15_usd": null,
    "estimated_tax_q2_jun15_usd": null,
    "estimated_tax_q3_sep15_usd": null,
    "estimated_tax_q4_jan15_usd": null,
    "prior_year_total_tax_usd": null,
    "additional_medicare_tax_owed_usd": 0
   },
   "nra_specific": {
    "files_form_1040nr": false,
    "s6013h_joint_election": false,
    "w8ben_aggregate_status": "none",
    "form_w7_itin_application_filed": false,
    "spouse_ssn_or_itin_type": "none",
    "us_eci_income_usd": 90000,
    "us_fdap_income_usd": 0,
    "treaty_rate_claims": [],
    "us_real_property_disposed": false,
    "firpta_withholding_usd": null,
    "is_lrs_investor": false
   },
   "metadata": {
    "us_calendar_year": 2026,
    "source": "onboarding",
    "input_completeness": "provisional",
    "schema_version": "layer1_us_v1",
    "obbba_threshold_table_version": "rev_proc_2025_32",
    "intake_completed": false,
    "intake_setup": {
     "setupW2": true,
     "setupBiz": false,
     "setupPassive": false,
     "setupProp": false,
     "setupEntities": false,
     "setupForeign": true,
     "setupRetirement": true,
     "setupEquity": false,
     "nested": {
      "foreignAssets": true,
      "foreignFeie": false,
      "foreignEntities": false,
      "foreignGifts": false,
      "passiveIntDiv": false,
      "passiveCapGains": false
     }
    }
   },
   "config": {
    "base_year": 2026
   }
  }
 }
};
  var W = root.WISING = root.WISING || {};
  W.householdSeedData = DATA;
  if (typeof module !== "undefined" && module.exports) module.exports = DATA;
})(typeof window !== "undefined" ? window : globalThis);
