#!/usr/bin/env python3
"""
MedBridge — Nepal-context synthetic data for XGBoost demand forecasting.

Covers full hospital spectrum (general, teaching, cancer, children, maternity,
eye, trauma, PHC, community, private) across all 7 provinces.

8 DEMO hospitals (is_demo=1) are used for final-report multi-login showcase.
"""

from __future__ import annotations

import argparse
import json
import math
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

RNG = np.random.default_rng(42)

START_DATE = date(2023, 1, 2)
END_DATE = date(2026, 6, 30)

ROOT = Path(__file__).resolve().parents[1]
OUT_RAW = ROOT / "data" / "raw"
OUT_PROCESSED = ROOT / "data" / "processed"
OUT_DOCS = Path(__file__).resolve().parents[3] / "docs" / "data"

SEASONAL_BASE = {
    1: 1.25, 2: 1.15, 3: 1.05, 4: 1.00, 5: 1.10, 6: 1.35,
    7: 1.45, 8: 1.40, 9: 1.25, 10: 1.20, 11: 1.05, 12: 1.15,
}

CATEGORY_SEASON = {
    "Antibiotic": {6: 1.25, 7: 1.35, 8: 1.30, 9: 1.15},
    "Analgesic": {9: 1.15, 10: 1.20},
    "Antipyretic": {6: 1.30, 7: 1.40, 8: 1.35},
    "ORS_Electrolyte": {5: 1.40, 6: 1.70, 7: 1.80, 8: 1.60, 9: 1.30},
    "Antimalarial": {6: 1.50, 7: 1.70, 8: 1.60, 9: 1.40},
    "Antidiarrheal": {5: 1.35, 6: 1.60, 7: 1.70, 8: 1.50},
    "Respiratory": {11: 1.30, 12: 1.50, 1: 1.60, 2: 1.40, 3: 1.20},
    "Cardiovascular": {},
    "Antidiabetic": {},
    "Vaccine": {3: 1.20, 4: 1.25, 9: 1.15, 10: 1.20},
    "IV_Fluid": {6: 1.30, 7: 1.40, 8: 1.35, 1: 1.15},
    "Surgical_Consumable": {9: 1.20, 10: 1.25},
    "Antihypertensive": {},
    "Gastrointestinal": {5: 1.20, 6: 1.35, 7: 1.40, 8: 1.30},
    "Antiseptic": {9: 1.15, 10: 1.20},
    "Anthelmintic": {2: 1.40, 3: 1.50, 8: 1.30, 9: 1.25},
    "Oncology": {1: 1.05, 2: 1.05, 3: 1.05, 4: 1.05, 5: 1.05, 6: 1.05,
                 7: 1.05, 8: 1.05, 9: 1.05, 10: 1.05, 11: 1.05, 12: 1.05},
    "Pediatric": {6: 1.25, 7: 1.35, 8: 1.30, 12: 1.20, 1: 1.25, 2: 1.20},
    "Maternity_OBGYN": {1: 1.05, 10: 1.10},
    "Ophthalmic": {},
    "Trauma_Emergency": {9: 1.25, 10: 1.30, 6: 1.15, 7: 1.15},
    "Blood_Product": {9: 1.20, 10: 1.25},
    "Anesthetic": {},
    "Nutritional": {6: 1.15, 7: 1.20, 8: 1.15},
}

FACILITY_LOAD = {
    "Central_Hospital": 1.00,
    "Regional_Hospital": 0.65,
    "Zonal_Hospital": 0.45,
    "District_Hospital": 0.30,
    "Teaching_Hospital": 0.85,
    "Primary_Health_Center": 0.12,
    "Community_Hospital": 0.22,
    "Cancer_Hospital": 0.70,
    "Children_Hospital": 0.55,
    "Maternity_Hospital": 0.50,
    "Eye_Hospital": 0.35,
    "Trauma_Center": 0.60,
    "Mental_Hospital": 0.25,
    "Ayurveda_Hospital": 0.15,
}

# Specialty mix: multiplies base demand by medicine category for specialty hospitals
SPECIALTY_CATEGORY_BOOST = {
    "Cancer_Hospital": {
        "Oncology": 8.0, "Analgesic": 2.0, "Antibiotic": 1.3, "IV_Fluid": 1.8,
        "Antiemetic": 3.0, "Blood_Product": 2.5, "Nutritional": 2.0,
        "Pediatric": 0.3, "Maternity_OBGYN": 0.2, "Ophthalmic": 0.3,
        "Vaccine": 0.4, "Antimalarial": 0.4, "ORS_Electrolyte": 0.6,
    },
    "Children_Hospital": {
        "Pediatric": 6.0, "Vaccine": 3.5, "ORS_Electrolyte": 2.5, "Antibiotic": 1.8,
        "Antipyretic": 2.0, "Respiratory": 2.2, "Nutritional": 2.0,
        "Oncology": 0.8, "Antihypertensive": 0.15, "Cardiovascular": 0.2,
        "Antidiabetic": 0.2, "Maternity_OBGYN": 0.1, "Anesthetic": 0.8,
    },
    "Maternity_Hospital": {
        "Maternity_OBGYN": 7.0, "Blood_Product": 3.0, "IV_Fluid": 2.0,
        "Antibiotic": 1.5, "Analgesic": 1.4, "Anesthetic": 2.5,
        "Oncology": 0.2, "Pediatric": 1.2, "Vaccine": 1.3,
        "Cardiovascular": 0.5, "Antimalarial": 0.5,
    },
    "Eye_Hospital": {
        "Ophthalmic": 10.0, "Antibiotic": 1.2, "Analgesic": 1.1,
        "Anesthetic": 1.5, "Surgical_Consumable": 1.8,
        "Oncology": 0.2, "ORS_Electrolyte": 0.3, "Antimalarial": 0.2,
        "Maternity_OBGYN": 0.1, "Pediatric": 0.4, "Vaccine": 0.3,
    },
    "Trauma_Center": {
        "Trauma_Emergency": 6.0, "Surgical_Consumable": 3.0, "Analgesic": 2.5,
        "Anesthetic": 2.5, "Blood_Product": 3.0, "IV_Fluid": 2.2,
        "Antibiotic": 1.6, "Antiseptic": 2.0,
        "Oncology": 0.2, "Maternity_OBGYN": 0.3, "Ophthalmic": 0.4,
    },
    "Mental_Hospital": {
        "Cardiovascular": 0.6, "Antidiabetic": 0.6, "Antihypertensive": 0.7,
        "Oncology": 0.1, "Surgical_Consumable": 0.3, "Trauma_Emergency": 0.2,
        "Maternity_OBGYN": 0.1, "Vaccine": 0.4, "ORS_Electrolyte": 0.5,
    },
}

ECOREGION_PRESSURE = {
    "Mountain": {"Respiratory": 1.25, "Cardiovascular": 1.10, "Antimalarial": 0.30},
    "Hill": {"Respiratory": 1.10, "Antimalarial": 0.70, "ORS_Electrolyte": 1.00},
    "Terai": {
        "Antimalarial": 1.50, "ORS_Electrolyte": 1.35, "Antidiarrheal": 1.30,
        "Antipyretic": 1.20, "Antibiotic": 1.15,
    },
}

URBAN_MULT = {
    "Metropolitan": 1.15,
    "Sub_Metropolitan": 1.00,
    "Municipality": 0.75,
    "Rural_Municipality": 0.55,
}


def build_hospitals() -> pd.DataFrame:
    """
    Full Nepal network + 8 DEMO facilities for multi-login showcase.

    Demo set (is_demo=1) spans specialties & geography so exchange / forecast
    demos look realistic:
      DEMO-01 Bir Hospital              — Central general (Kathmandu)
      DEMO-02 TUTH                      — Teaching (Kathmandu)
      DEMO-03 Bhaktapur Cancer Hospital — Cancer specialty
      DEMO-04 Kanti Children's          — Pediatric specialty
      DEMO-05 Paropakar Maternity       — Maternity
      DEMO-06 Koshi Hospital            — Regional Terai
      DEMO-07 Pokhara Academy           — Regional Hill
      DEMO-08 Jumla District            — Remote Mountain
    """
    rows = [
        # ---------- DEMO 8 (final report multi-login) ----------
        ("DEMO-01", "Bir Hospital", "Central_Hospital", "Bagmati", "Kathmandu", "Kathmandu", "Hill", "Metropolitan", 27.7052, 85.3140, 460, "public", 1, "General / Emergency / Referral"),
        ("DEMO-02", "Tribhuvan University Teaching Hospital (TUTH)", "Teaching_Hospital", "Bagmati", "Kathmandu", "Maharajgunj", "Hill", "Metropolitan", 27.7360, 85.3300, 700, "public", 1, "Teaching / Multi-specialty"),
        ("DEMO-03", "Bhaktapur Cancer Hospital", "Cancer_Hospital", "Bagmati", "Bhaktapur", "Dudhpati", "Hill", "Municipality", 27.6725, 85.4278, 120, "public", 1, "Oncology / Chemotherapy / Palliative"),
        ("DEMO-04", "Kanti Children's Hospital", "Children_Hospital", "Bagmati", "Kathmandu", "Maharajgunj", "Hill", "Metropolitan", 27.7375, 85.3320, 350, "public", 1, "Pediatrics / Neonatal / Vaccines"),
        ("DEMO-05", "Paropakar Maternity & Women's Hospital", "Maternity_Hospital", "Bagmati", "Kathmandu", "Thapathali", "Hill", "Metropolitan", 27.6900, 85.3200, 415, "public", 1, "OBGYN / Labor / Blood bank"),
        ("DEMO-06", "Koshi Hospital", "Regional_Hospital", "Koshi", "Morang", "Biratnagar", "Terai", "Metropolitan", 26.4525, 87.2718, 350, "public", 1, "Regional general / Monsoon load"),
        ("DEMO-07", "Pokhara Academy of Health Sciences", "Regional_Hospital", "Gandaki", "Kaski", "Pokhara", "Hill", "Metropolitan", 28.2096, 83.9856, 500, "public", 1, "Regional / Trauma / Tourism corridor"),
        ("DEMO-08", "Jumla District Hospital", "District_Hospital", "Karnali", "Jumla", "Khalanga", "Mountain", "Municipality", 29.2740, 82.1830, 50, "public", 1, "Remote mountain / Access-limited"),

        # ---------- Specialty & extended network ----------
        ("HOSP-BG-010", "BP Koirala Memorial Cancer Hospital", "Cancer_Hospital", "Bagmati", "Chitwan", "Bharatpur", "Terai", "Metropolitan", 27.6700, 84.4300, 250, "public", 0, "National cancer referral"),
        ("HOSP-BG-011", "Tilganga Institute of Ophthalmology", "Eye_Hospital", "Bagmati", "Kathmandu", "Gaushala", "Hill", "Metropolitan", 27.7050, 85.3480, 100, "community", 0, "Eye specialty"),
        ("HOSP-BG-012", "National Trauma Center", "Trauma_Center", "Bagmati", "Kathmandu", "Mahankal", "Hill", "Metropolitan", 27.7020, 85.3200, 200, "public", 0, "Trauma / Ortho emergency"),
        ("HOSP-BG-013", "Patan Hospital", "Teaching_Hospital", "Bagmati", "Lalitpur", "Lagankhel", "Hill", "Metropolitan", 27.6683, 85.3222, 450, "public", 0, "Teaching / General"),
        ("HOSP-BG-014", "Civil Service Hospital", "Central_Hospital", "Bagmati", "Kathmandu", "Minbhawan", "Hill", "Metropolitan", 27.6910, 85.3420, 200, "public", 0, "Civil servants / General"),
        ("HOSP-BG-015", "Dhulikhel Hospital", "Teaching_Hospital", "Bagmati", "Kavrepalanchok", "Dhulikhel", "Hill", "Municipality", 27.6190, 85.5420, 375, "community", 0, "Community teaching"),
        ("HOSP-BG-016", "Hetauda Hospital", "Zonal_Hospital", "Bagmati", "Makwanpur", "Hetauda", "Hill", "Sub_Metropolitan", 27.4280, 85.0320, 150, "public", 0, "Zonal general"),
        ("HOSP-BG-017", "Chautara District Hospital", "District_Hospital", "Bagmati", "Sindhupalchok", "Chautara", "Hill", "Municipality", 27.7780, 85.7160, 50, "public", 0, "District hill"),
        ("HOSP-BG-018", "Mental Hospital Lagankhel", "Mental_Hospital", "Bagmati", "Lalitpur", "Lagankhel", "Hill", "Metropolitan", 27.6660, 85.3240, 100, "public", 0, "Psychiatry"),
        ("HOSP-BG-019", "Grande International Hospital", "Central_Hospital", "Bagmati", "Kathmandu", "Dhapasi", "Hill", "Metropolitan", 27.7500, 85.3300, 200, "private", 0, "Private multi-specialty"),

        # Koshi
        ("HOSP-KP-001", "B.P. Koirala Institute of Health Sciences (BPKIHS)", "Teaching_Hospital", "Koshi", "Sunsari", "Dharan", "Hill", "Sub_Metropolitan", 26.8065, 87.2846, 700, "public", 0, "Eastern teaching referral"),
        ("HOSP-KP-003", "Mechi Zonal Hospital", "Zonal_Hospital", "Koshi", "Jhapa", "Bhadrapur", "Terai", "Municipality", 26.5440, 88.0940, 180, "public", 0, "Eastern border Terai"),
        ("HOSP-KP-004", "Okhaldhunga Community Hospital", "Community_Hospital", "Koshi", "Okhaldhunga", "Siddhicharan", "Hill", "Municipality", 27.3167, 86.5042, 50, "community", 0, "Hill community"),

        # Madhesh
        ("HOSP-MD-001", "Provincial Hospital Janakpur", "Regional_Hospital", "Madhesh", "Dhanusha", "Janakpur", "Terai", "Sub_Metropolitan", 26.7288, 85.9250, 300, "public", 0, "Madhesh regional"),
        ("HOSP-MD-002", "Narayani Hospital", "Zonal_Hospital", "Madhesh", "Parsa", "Birgunj", "Terai", "Metropolitan", 27.0104, 84.8770, 250, "public", 0, "Border trade hub"),
        ("HOSP-MD-003", "Gaur District Hospital", "District_Hospital", "Madhesh", "Rautahat", "Gaur", "Terai", "Municipality", 26.7640, 85.2780, 75, "public", 0, "District Terai"),
        ("HOSP-MD-004", "National Medical College Teaching Hospital", "Teaching_Hospital", "Madhesh", "Parsa", "Birgunj", "Terai", "Metropolitan", 27.0200, 84.8800, 700, "private", 0, "Private teaching"),

        # Gandaki
        ("HOSP-GD-002", "Dhaulagiri Hospital", "Zonal_Hospital", "Gandaki", "Baglung", "Baglung", "Hill", "Municipality", 28.2700, 83.5900, 100, "public", 0, "Hill zonal"),
        ("HOSP-GD-003", "Gorkha District Hospital", "District_Hospital", "Gandaki", "Gorkha", "Gorkha Bazaar", "Hill", "Municipality", 28.0000, 84.6330, 60, "public", 0, "District hill"),
        ("HOSP-GD-004", "Manang Primary Health Center", "Primary_Health_Center", "Gandaki", "Manang", "Chame", "Mountain", "Rural_Municipality", 28.5560, 84.2410, 15, "public", 0, "High mountain PHC"),
        ("HOSP-GD-005", "Manipal Teaching Hospital", "Teaching_Hospital", "Gandaki", "Kaski", "Pokhara", "Hill", "Metropolitan", 28.2400, 83.9900, 750, "private", 0, "Private teaching"),

        # Lumbini
        ("HOSP-LB-001", "Lumbini Provincial Hospital", "Regional_Hospital", "Lumbini", "Rupandehi", "Butwal", "Terai", "Sub_Metropolitan", 27.7000, 83.4480, 300, "public", 0, "Lumbini regional"),
        ("HOSP-LB-002", "Bheri Hospital", "Zonal_Hospital", "Lumbini", "Banke", "Nepalgunj", "Terai", "Sub_Metropolitan", 28.0500, 81.6160, 250, "public", 0, "Mid-west Terai"),
        ("HOSP-LB-003", "Rapti Academy of Health Sciences", "Teaching_Hospital", "Lumbini", "Dang", "Ghorahi", "Terai", "Sub_Metropolitan", 28.0400, 82.4850, 200, "public", 0, "Teaching Terai"),
        ("HOSP-LB-004", "Pyuthan District Hospital", "District_Hospital", "Lumbini", "Pyuthan", "Pyuthan Khalanga", "Hill", "Municipality", 28.1000, 82.8700, 45, "public", 0, "District hill"),
        ("HOSP-LB-005", "Lumbini Medical College Teaching Hospital", "Teaching_Hospital", "Lumbini", "Palpa", "Tansen", "Hill", "Municipality", 27.8670, 83.5460, 600, "private", 0, "Private teaching hill"),

        # Karnali
        ("HOSP-KR-001", "Karnali Provincial Hospital", "Regional_Hospital", "Karnali", "Surkhet", "Birendranagar", "Hill", "Municipality", 28.6000, 81.6160, 200, "public", 0, "Karnali regional"),
        ("HOSP-KR-003", "Dolpa Primary Health Center", "Primary_Health_Center", "Karnali", "Dolpa", "Dunai", "Mountain", "Rural_Municipality", 28.9500, 82.9000, 12, "public", 0, "Remote mountain PHC"),
        ("HOSP-KR-004", "Rukum West District Hospital", "District_Hospital", "Karnali", "Rukum West", "Musikot", "Hill", "Municipality", 28.6300, 82.4500, 40, "public", 0, "District hill"),

        # Sudurpashchim
        ("HOSP-SP-001", "Seti Provincial Hospital", "Regional_Hospital", "Sudurpashchim", "Kailali", "Dhangadhi", "Terai", "Sub_Metropolitan", 28.6850, 80.6210, 280, "public", 0, "Far-west regional"),
        ("HOSP-SP-002", "Mahakali Hospital", "Zonal_Hospital", "Sudurpashchim", "Kanchanpur", "Bhimdatta", "Terai", "Municipality", 28.9700, 80.1800, 150, "public", 0, "Far-west border"),
        ("HOSP-SP-003", "Bajhang District Hospital", "District_Hospital", "Sudurpashchim", "Bajhang", "Chainpur", "Mountain", "Municipality", 29.5500, 81.2000, 35, "public", 0, "Mountain district"),
        ("HOSP-SP-004", "Dadeldhura Hospital", "District_Hospital", "Sudurpashchim", "Dadeldhura", "Amargadhi", "Hill", "Municipality", 29.3000, 80.5800, 55, "public", 0, "Hill district"),
    ]
    cols = [
        "hospital_id", "hospital_name", "facility_type", "province", "district",
        "municipality", "ecoregion", "urban_class", "latitude", "longitude",
        "bed_capacity", "ownership", "is_demo", "specialty_focus",
    ]
    df = pd.DataFrame(rows, columns=cols)
    df["load_factor"] = df["facility_type"].map(FACILITY_LOAD).astype(float)
    df["urban_factor"] = df["urban_class"].map(URBAN_MULT).astype(float)
    df["is_referral"] = df["facility_type"].isin([
        "Central_Hospital", "Regional_Hospital", "Teaching_Hospital",
        "Cancer_Hospital", "Trauma_Center", "Children_Hospital", "Maternity_Hospital",
    ]).astype(int)
    base_access = df["ecoregion"].map({"Terai": 0.95, "Hill": 0.75, "Mountain": 0.40}).astype(float)
    df["road_access_score"] = (base_access + RNG.normal(0, 0.04, len(df))).clip(0.2, 1.0).round(3)

    # Demo login credentials (for later frontend; stored for seed)
    demo_mask = df["is_demo"] == 1
    df["demo_username"] = np.where(demo_mask, df["hospital_id"].str.lower().str.replace("-", "_"), "")
    df["demo_role"] = np.where(demo_mask, "hospital_admin", "")
    return df


def build_medicines() -> pd.DataFrame:
    rows = [
        # General essential
        ("MED-001", "Paracetamol", "Calpol / Napa", "Antipyretic", "Tablet", "500mg", "tablet", 100, 36, 1.5, 0, 1, 45.0),
        ("MED-002", "Paracetamol", "PCM Syrup", "Antipyretic", "Syrup", "125mg/5ml", "bottle", 1, 24, 45.0, 0, 1, 8.0),
        ("MED-003", "Ibuprofen", "Brufen", "Analgesic", "Tablet", "400mg", "tablet", 100, 36, 2.5, 0, 1, 18.0),
        ("MED-004", "Diclofenac", "Voveran", "Analgesic", "Injection", "75mg/3ml", "ampoule", 10, 24, 25.0, 0, 1, 6.0),
        ("MED-005", "Amoxicillin", "Amoxil", "Antibiotic", "Capsule", "500mg", "capsule", 100, 24, 6.0, 0, 1, 22.0),
        ("MED-006", "Amoxicillin + Clavulanate", "Augmentin", "Antibiotic", "Tablet", "625mg", "tablet", 10, 24, 35.0, 0, 1, 10.0),
        ("MED-007", "Azithromycin", "Azithral", "Antibiotic", "Tablet", "500mg", "tablet", 3, 24, 40.0, 0, 1, 8.0),
        ("MED-008", "Ciprofloxacin", "Cifran", "Antibiotic", "Tablet", "500mg", "tablet", 10, 36, 8.0, 0, 1, 12.0),
        ("MED-009", "Ceftriaxone", "Monocef", "Antibiotic", "Injection", "1g", "vial", 1, 24, 85.0, 0, 1, 9.0),
        ("MED-010", "Metronidazole", "Flagyl", "Antibiotic", "Tablet", "400mg", "tablet", 100, 36, 2.0, 0, 1, 14.0),
        ("MED-011", "ORS (WHO formula)", "Jeevan Jal", "ORS_Electrolyte", "Sachet", "20.5g", "sachet", 50, 36, 8.0, 0, 1, 25.0),
        ("MED-012", "Zinc Sulfate", "Zinconia", "ORS_Electrolyte", "Tablet", "20mg", "tablet", 100, 36, 1.2, 0, 1, 15.0),
        ("MED-013", "Ringer's Lactate", "RL IV", "IV_Fluid", "Infusion", "500ml", "bag", 1, 24, 55.0, 0, 1, 12.0),
        ("MED-014", "Normal Saline 0.9%", "NS IV", "IV_Fluid", "Infusion", "500ml", "bag", 1, 24, 45.0, 0, 1, 18.0),
        ("MED-015", "Dextrose 5%", "D5 IV", "IV_Fluid", "Infusion", "500ml", "bag", 1, 24, 48.0, 0, 1, 10.0),
        ("MED-016", "Artemether-Lumefantrine", "Coartem", "Antimalarial", "Tablet", "20/120mg", "tablet", 24, 24, 15.0, 0, 1, 3.5),
        ("MED-017", "Chloroquine", "Nivaquine", "Antimalarial", "Tablet", "250mg", "tablet", 100, 36, 1.8, 0, 0, 1.5),
        ("MED-018", "Salbutamol", "Asthalin", "Respiratory", "Inhaler", "100mcg", "unit", 1, 24, 180.0, 0, 1, 4.0),
        ("MED-019", "Salbutamol", "Asthalin Resp", "Respiratory", "Nebulizer_Solution", "5mg/ml", "ampoule", 10, 24, 30.0, 0, 1, 5.0),
        ("MED-020", "Amoxicillin (Pediatric)", "Mox Dry Syrup", "Pediatric", "Dry_Syrup", "125mg/5ml", "bottle", 1, 24, 55.0, 0, 1, 7.0),
        ("MED-021", "Amlodipine", "Amlovas", "Antihypertensive", "Tablet", "5mg", "tablet", 100, 36, 1.0, 0, 1, 20.0),
        ("MED-022", "Losartan", "Repace", "Antihypertensive", "Tablet", "50mg", "tablet", 100, 36, 2.5, 0, 1, 16.0),
        ("MED-023", "Metformin", "Glycomet", "Antidiabetic", "Tablet", "500mg", "tablet", 100, 36, 1.5, 0, 1, 22.0),
        ("MED-024", "Insulin Human Regular", "Actrapid", "Antidiabetic", "Injection", "100IU/ml", "vial", 1, 24, 450.0, 1, 1, 3.0),
        ("MED-025", "Atorvastatin", "Atorva", "Cardiovascular", "Tablet", "10mg", "tablet", 100, 36, 3.0, 0, 1, 12.0),
        ("MED-026", "Aspirin", "Disprin", "Cardiovascular", "Tablet", "75mg", "tablet", 100, 36, 0.8, 0, 1, 18.0),
        ("MED-027", "Omeprazole", "Omez", "Gastrointestinal", "Capsule", "20mg", "capsule", 100, 36, 2.0, 0, 1, 20.0),
        ("MED-028", "Ondansetron", "Emeset", "Gastrointestinal", "Tablet", "4mg", "tablet", 10, 36, 6.0, 0, 1, 8.0),
        ("MED-029", "Loperamide", "Imodium", "Antidiarrheal", "Tablet", "2mg", "tablet", 100, 36, 1.5, 0, 1, 6.0),
        ("MED-030", "Povidone Iodine", "Betadine", "Antiseptic", "Solution", "10%", "bottle_100ml", 1, 36, 85.0, 0, 1, 5.0),
        ("MED-031", "Surgical Gloves (sterile)", "MediGlove", "Surgical_Consumable", "Pair", "Size 7", "pair", 50, 60, 25.0, 0, 1, 30.0),
        ("MED-032", "Disposable Syringe", "Dispovan", "Surgical_Consumable", "Syringe", "5ml", "piece", 100, 60, 5.0, 0, 1, 40.0),
        ("MED-033", "IV Cannula", "Vasofix", "Surgical_Consumable", "Cannula", "20G", "piece", 50, 60, 35.0, 0, 1, 15.0),
        ("MED-034", "Tetanus Toxoid", "TT Vaccine", "Vaccine", "Injection", "0.5ml", "vial", 10, 24, 25.0, 1, 1, 2.5),
        ("MED-035", "Anti-Rabies Vaccine", "Abhayrab", "Vaccine", "Injection", "0.5ml", "vial", 1, 24, 350.0, 1, 1, 1.2),
        ("MED-036", "Iron + Folic Acid", "IFA", "Maternity_OBGYN", "Tablet", "60mg/400mcg", "tablet", 100, 24, 0.5, 0, 1, 28.0),
        ("MED-037", "Albendazole", "Zentel", "Anthelmintic", "Tablet", "400mg", "tablet", 1, 36, 8.0, 0, 1, 4.0),
        ("MED-038", "Dexamethasone", "Dexona", "Respiratory", "Injection", "4mg/ml", "ampoule", 10, 24, 12.0, 0, 1, 4.5),
        ("MED-039", "Pheniramine", "Avil", "Respiratory", "Injection", "22.75mg/ml", "ampoule", 10, 36, 10.0, 0, 1, 3.5),
        ("MED-040", "Tramadol", "Tramazac", "Analgesic", "Injection", "50mg/ml", "ampoule", 10, 36, 28.0, 0, 0, 3.0),
        # Oncology
        ("MED-041", "Cyclophosphamide", "Endoxan", "Oncology", "Injection", "500mg", "vial", 1, 24, 180.0, 0, 1, 2.0),
        ("MED-042", "Doxorubicin", "Adriamycin", "Oncology", "Injection", "50mg", "vial", 1, 24, 1200.0, 1, 1, 1.2),
        ("MED-043", "Paclitaxel", "Taxol", "Oncology", "Injection", "100mg", "vial", 1, 24, 3500.0, 0, 1, 0.8),
        ("MED-044", "Cisplatin", "Platin", "Oncology", "Injection", "50mg", "vial", 1, 24, 450.0, 0, 1, 1.0),
        ("MED-045", "Morphine Sulfate", "Morphine", "Oncology", "Tablet", "10mg", "tablet", 20, 24, 15.0, 0, 1, 4.0),
        ("MED-046", "Filgrastim (G-CSF)", "Neupogen", "Oncology", "Injection", "300mcg", "prefilled", 1, 18, 4500.0, 1, 1, 0.6),
        # Pediatric
        ("MED-047", "ORS Pediatric", "Jeevan Jal Junior", "Pediatric", "Sachet", "10.2g", "sachet", 50, 36, 6.0, 0, 1, 18.0),
        ("MED-048", "Amoxicillin Pediatric Drops", "Mox Drops", "Pediatric", "Drops", "100mg/ml", "bottle", 1, 24, 65.0, 0, 1, 6.0),
        ("MED-049", "Vitamin A Capsule", "Retinol", "Pediatric", "Capsule", "200000 IU", "capsule", 100, 24, 2.0, 0, 1, 8.0),
        ("MED-050", "Pentavalent Vaccine", "DPT-HepB-Hib", "Vaccine", "Injection", "0.5ml", "vial", 10, 24, 120.0, 1, 1, 3.5),
        ("MED-051", "Measles-Rubella Vaccine", "MR Vaccine", "Vaccine", "Injection", "0.5ml", "vial", 10, 24, 80.0, 1, 1, 3.0),
        ("MED-052", "Oral Rehydration + Zinc Kit", "ORS-Zinc Kit", "Pediatric", "Kit", "combo", "kit", 1, 24, 25.0, 0, 1, 10.0),
        # Maternity
        ("MED-053", "Oxytocin", "Pitocin", "Maternity_OBGYN", "Injection", "10 IU/ml", "ampoule", 10, 24, 35.0, 1, 1, 8.0),
        ("MED-054", "Misoprostol", "Cytotec", "Maternity_OBGYN", "Tablet", "200mcg", "tablet", 4, 24, 20.0, 0, 1, 5.0),
        ("MED-055", "Magnesium Sulfate", "MgSO4", "Maternity_OBGYN", "Injection", "50%", "ampoule", 10, 36, 18.0, 0, 1, 3.0),
        ("MED-056", "Tranexamic Acid", "TXA", "Maternity_OBGYN", "Injection", "500mg", "ampoule", 5, 36, 45.0, 0, 1, 2.5),
        # Ophthalmic
        ("MED-057", "Ciprofloxacin Eye Drops", "Ciplox Eye", "Ophthalmic", "Drops", "0.3%", "bottle", 1, 24, 55.0, 0, 1, 6.0),
        ("MED-058", "Timolol Eye Drops", "Glucomol", "Ophthalmic", "Drops", "0.5%", "bottle", 1, 24, 90.0, 0, 1, 4.0),
        ("MED-059", "Tropicamide Eye Drops", "Tropicacyl", "Ophthalmic", "Drops", "1%", "bottle", 1, 24, 70.0, 0, 1, 3.5),
        # Trauma / emergency
        ("MED-060", "Anti-Snake Venom (ASVS)", "ASV", "Trauma_Emergency", "Injection", "10ml", "vial", 1, 24, 2500.0, 1, 1, 0.8),
        ("MED-061", "Adrenaline", "Epinephrine", "Trauma_Emergency", "Injection", "1mg/ml", "ampoule", 10, 24, 25.0, 0, 1, 2.0),
        ("MED-062", "Atropine", "Atropine SO4", "Trauma_Emergency", "Injection", "0.6mg/ml", "ampoule", 10, 36, 12.0, 0, 1, 1.5),
        ("MED-063", "Tetanus Immunoglobulin", "TIG", "Trauma_Emergency", "Injection", "250 IU", "vial", 1, 24, 850.0, 1, 1, 1.0),
        ("MED-064", "Plaster of Paris Bandage", "POP", "Trauma_Emergency", "Bandage", "15cm", "roll", 12, 60, 80.0, 0, 1, 8.0),
        # Blood / anesthetic / nutrition
        ("MED-065", "Whole Blood Unit (proxy stock)", "Blood Bank Unit", "Blood_Product", "Unit", "350ml", "unit", 1, 1, 0.0, 1, 1, 2.0),
        ("MED-066", "Packed RBC (proxy)", "PRBC", "Blood_Product", "Unit", "250ml", "unit", 1, 1, 0.0, 1, 1, 1.5),
        ("MED-067", "Lignocaine 2%", "Xylocaine", "Anesthetic", "Injection", "2%", "vial", 1, 36, 40.0, 0, 1, 5.0),
        ("MED-068", "Ketamine", "Ketalar", "Anesthetic", "Injection", "50mg/ml", "vial", 1, 36, 180.0, 0, 1, 1.5),
        ("MED-069", "Spinal Bupivacaine", "Sensorcaine", "Anesthetic", "Injection", "0.5%", "ampoule", 5, 36, 95.0, 0, 1, 2.0),
        ("MED-070", "Ready-to-Use Therapeutic Food", "RUTF", "Nutritional", "Sachet", "92g", "sachet", 150, 24, 120.0, 0, 1, 4.0),
        ("MED-071", "Fentanyl", "Fent", "Analgesic", "Injection", "50mcg/ml", "ampoule", 10, 24, 150.0, 0, 0, 1.2),
        ("MED-072", "Meropenem", "Meronem", "Antibiotic", "Injection", "1g", "vial", 1, 24, 650.0, 0, 1, 2.5),
    ]
    cols = [
        "medicine_id", "generic_name", "brand_example", "category", "dosage_form",
        "strength", "unit", "pack_size", "shelf_life_months", "unit_cost_npr",
        "requires_cold_chain", "is_essential", "base_demand_per_100_beds",
    ]
    df = pd.DataFrame(rows, columns=cols)
    value = df["unit_cost_npr"] * df["base_demand_per_100_beds"]
    df["abc_class"] = pd.cut(value, bins=[-np.inf, 30, 150, np.inf], labels=["C", "B", "A"]).astype(str)
    return df


def week_starts(start: date, end: date) -> pd.DatetimeIndex:
    s = pd.Timestamp(start)
    s = s - pd.Timedelta(days=s.weekday())
    e = pd.Timestamp(end)
    return pd.date_range(s, e, freq="W-MON")


def festival_boost_month_day(month: int, day: int) -> float:
    if (month == 9 and day >= 25) or (month == 10 and day <= 20):
        return 1.25
    if (month == 10 and day >= 25) or (month == 11 and day <= 5):
        return 1.15
    if month == 3 and 5 <= day <= 15:
        return 1.10
    if month == 4 and 10 <= day <= 16:
        return 1.08
    return 1.0


def specialty_mult(facility_type: str, category: str) -> float:
    boosts = SPECIALTY_CATEGORY_BOOST.get(facility_type)
    if not boosts:
        # general hospitals: mild suppress pure specialty drugs
        if category in ("Oncology", "Ophthalmic"):
            return 0.25
        if category in ("Maternity_OBGYN", "Pediatric"):
            return 0.70
        if category in ("Trauma_Emergency", "Blood_Product", "Anesthetic"):
            return 0.85
        return 1.0
    return float(boosts.get(category, 0.55))


def generate_demand_history(hospitals: pd.DataFrame, medicines: pd.DataFrame) -> pd.DataFrame:
    weeks = week_starts(START_DATE, END_DATE)
    print(f"Generating weekly demand: {len(hospitals)} hospitals × {len(medicines)} medicines × {len(weeks)} weeks")

    h = hospitals.copy()
    m = medicines.copy()
    h["_k"] = 1
    m["_k"] = 1
    pairs = h.merge(m, on="_k").drop(columns="_k")
    pairs["affinity"] = RNG.normal(1.0, 0.10, len(pairs)).clip(0.65, 1.45)
    pairs["spec_mult"] = [
        specialty_mult(ft, cat) for ft, cat in zip(pairs["facility_type"], pairs["category"])
    ]

    pairs["_k"] = 1
    wdf = pd.DataFrame({"week_start": weeks, "_k": 1})
    df = pairs.merge(wdf, on="_k").drop(columns="_k")

    df["year"] = df["week_start"].dt.year
    df["month"] = df["week_start"].dt.month
    df["week_of_year"] = df["week_start"].dt.isocalendar().week.astype(int)
    df["quarter"] = df["week_start"].dt.quarter
    df["day"] = df["week_start"].dt.day
    df["is_monsoon"] = df["month"].isin([6, 7, 8, 9]).astype(int)
    df["is_winter"] = df["month"].isin([12, 1, 2]).astype(int)
    df["seasonal_index"] = df["month"].map(SEASONAL_BASE).astype(float)
    df["festival_boost"] = [
        festival_boost_month_day(int(mth), int(dy))
        for mth, dy in zip(df["month"], df["day"])
    ]
    df["is_festival_window"] = (df["festival_boost"] > 1.05).astype(int)
    df["category_season_mult"] = [
        CATEGORY_SEASON.get(c, {}).get(int(mth), 1.0)
        for c, mth in zip(df["category"], df["month"])
    ]
    df["ecoregion_cat_mult"] = [
        ECOREGION_PRESSURE.get(e, {}).get(c, 1.0)
        for e, c in zip(df["ecoregion"], df["category"])
    ]

    print("  computing shock factors...")
    n = len(df)
    shock = np.ones(n, dtype=float)
    monsoon_mask = df["is_monsoon"].to_numpy().astype(bool)
    winter_mask = df["is_winter"].to_numpy().astype(bool)
    eco = df["ecoregion"].to_numpy()
    prov = df["province"].to_numpy()
    dist = df["district"].to_numpy()
    year = df["year"].to_numpy()
    woy = df["week_of_year"].to_numpy()
    month = df["month"].to_numpy()
    is_ref = df["is_referral"].to_numpy()
    cat = df["category"].to_numpy()
    ftype = df["facility_type"].to_numpy()

    for i in range(n):
        s = 1.0
        if monsoon_mask[i]:
            key = hash((int(year[i]), int(woy[i]), prov[i])) % 100
            if eco[i] == "Terai" and key < 8:
                s = max(s, 1.45)
            elif eco[i] == "Hill" and key < 5:
                s = max(s, 1.30)
            elif eco[i] == "Mountain" and key < 3:
                s = max(s, 1.20)
        if winter_mask[i]:
            key = hash((int(year[i]), int(woy[i]), eco[i])) % 100
            if key < 10:
                s = max(s, 1.35)
        if month[i] in (8, 9, 10) and (eco[i] == "Terai" or dist[i] in ("Kathmandu", "Lalitpur", "Bhaktapur", "Kaski")):
            key = hash((int(year[i]), dist[i])) % 100
            if key < 25 and cat[i] in ("Antipyretic", "Analgesic", "IV_Fluid", "Antibiotic", "Pediatric"):
                s = max(s, 1.55)
        # trauma festival
        if month[i] in (9, 10) and cat[i] in ("Trauma_Emergency", "Surgical_Consumable", "Blood_Product"):
            s = max(s, 1.20)
        if s > 1.05 and is_ref[i]:
            s = 1.0 + (s - 1.0) * 1.20
        # cancer hospitals stable chemo load — damp external shocks
        if ftype[i] == "Cancer_Hospital":
            s = 1.0 + (s - 1.0) * 0.35
        shock[i] = s
    df["shock_factor"] = shock

    daily_base = (
        df["base_demand_per_100_beds"]
        * (df["bed_capacity"] / 100.0)
        * df["load_factor"]
        * df["urban_factor"]
        * df["affinity"]
        * df["spec_mult"]
    )
    priv = df["ownership"].eq("private")
    daily_base = daily_base.where(
        ~priv,
        daily_base
        * np.where(df["category"].isin(["Surgical_Consumable", "Antibiotic", "Analgesic", "Anesthetic"]), 1.15, 1.0)
        * np.where((df["is_essential"] == 1) & (df["unit_cost_npr"] < 5), 0.85, 1.0),
    )
    cold_pen = (df["requires_cold_chain"] == 1) & (df["ecoregion"] == "Mountain")
    daily_base = daily_base.where(~cold_pen, daily_base * 0.70)

    year_factor = 1.0 + 0.03 * (df["year"] - START_DATE.year)
    mu_weekly = (
        daily_base * 7.0
        * df["seasonal_index"]
        * df["category_season_mult"]
        * df["ecoregion_cat_mult"]
        * df["festival_boost"]
        * df["shock_factor"]
        * year_factor
    )

    # Stronger signal, controlled noise for high model accuracy
    noise = RNG.lognormal(mean=0.0, sigma=0.10, size=len(df))
    lam = (mu_weekly * noise).clip(lower=0.05)
    demand = np.where(
        lam < 50,
        RNG.poisson(lam),
        np.maximum(0, RNG.normal(lam, np.sqrt(lam * 1.1))).astype(int),
    )

    stockout_p = np.where(
        df["ecoregion"].eq("Mountain"),
        0.035,
        np.where(
            df["ecoregion"].eq("Hill")
            & df["facility_type"].isin(["District_Hospital", "Primary_Health_Center"]),
            0.018,
            np.where(df["road_access_score"] < 0.5, 0.022, 0.005),
        ),
    )
    # specialty rare drugs stockout slightly higher outside specialty centers
    rare = df["category"].isin(["Oncology", "Ophthalmic"]) & ~df["facility_type"].isin(
        ["Cancer_Hospital", "Eye_Hospital", "Teaching_Hospital", "Central_Hospital"]
    )
    stockout_p = np.where(rare, np.maximum(stockout_p, 0.04), stockout_p)
    stockout = RNG.random(len(df)) < stockout_p
    demand = np.where(stockout, 0, demand)

    out = pd.DataFrame({
        "week_start": df["week_start"].dt.date.astype(str),
        "hospital_id": df["hospital_id"],
        "medicine_id": df["medicine_id"],
        "demand_units": demand.astype(int),
        "year": df["year"].astype(int),
        "month": df["month"].astype(int),
        "week_of_year": df["week_of_year"].astype(int),
        "quarter": df["quarter"].astype(int),
        "is_monsoon": df["is_monsoon"].astype(int),
        "is_winter": df["is_winter"].astype(int),
        "is_festival_window": df["is_festival_window"].astype(int),
        "seasonal_index": df["seasonal_index"].astype(float),
        "shock_factor": df["shock_factor"].round(3),
        "stockout_flag": stockout.astype(int),
        "spec_mult": df["spec_mult"].round(3),
    })
    return out


def build_xgb_features(demand: pd.DataFrame, hospitals: pd.DataFrame, medicines: pd.DataFrame) -> pd.DataFrame:
    print("Engineering XGBoost features...")
    df = demand.copy()
    df["week_start"] = pd.to_datetime(df["week_start"])
    df = df.sort_values(["hospital_id", "medicine_id", "week_start"]).reset_index(drop=True)

    g = df.groupby(["hospital_id", "medicine_id"], group_keys=False)["demand_units"]

    for lag in (1, 2, 3, 4, 8, 12):
        df[f"lag_{lag}w"] = g.shift(lag)

    for win in (2, 4, 8, 12):
        df[f"roll_mean_{win}w"] = g.transform(lambda s: s.shift(1).rolling(win, min_periods=1).mean())
        df[f"roll_std_{win}w"] = g.transform(lambda s: s.shift(1).rolling(win, min_periods=1).std())

    df["roll_min_4w"] = g.transform(lambda s: s.shift(1).rolling(4, min_periods=1).min())
    df["roll_max_4w"] = g.transform(lambda s: s.shift(1).rolling(4, min_periods=1).max())
    df["mom_4_12"] = df["roll_mean_4w"] / (df["roll_mean_12w"] + 1e-3)
    df["diff_1w"] = g.diff(1)
    df["diff_4w"] = g.diff(4)
    df["yoy_lag_52w"] = g.shift(52)

    # EWMA (shifted)
    df["ewm_4w"] = g.transform(lambda s: s.shift(1).ewm(span=4, adjust=False).mean())
    df["ewm_12w"] = g.transform(lambda s: s.shift(1).ewm(span=12, adjust=False).mean())

    hcols = [
        "hospital_id", "facility_type", "province", "district", "ecoregion",
        "urban_class", "bed_capacity", "ownership", "load_factor", "urban_factor",
        "is_referral", "road_access_score", "latitude", "longitude", "is_demo",
    ]
    mcols = [
        "medicine_id", "generic_name", "category", "dosage_form", "shelf_life_months",
        "unit_cost_npr", "requires_cold_chain", "is_essential",
        "base_demand_per_100_beds", "abc_class", "pack_size",
    ]
    df = df.merge(hospitals[hcols], on="hospital_id", how="left")
    df = df.merge(medicines[mcols], on="medicine_id", how="left")

    df["beds_x_base_demand"] = df["bed_capacity"] * df["base_demand_per_100_beds"] / 100.0
    df["cost_x_lag4"] = df["unit_cost_npr"] * df["lag_4w"].fillna(0)
    df["monsoon_x_terai"] = df["is_monsoon"] * (df["ecoregion"] == "Terai").astype(int)
    df["winter_x_mountain"] = df["is_winter"] * (df["ecoregion"] == "Mountain").astype(int)
    df["monsoon_x_ors"] = df["is_monsoon"] * (df["category"].isin(["ORS_Electrolyte", "Pediatric"])).astype(int)
    df["winter_x_respiratory"] = df["is_winter"] * (df["category"] == "Respiratory").astype(int)
    df["cancer_x_onco"] = (df["facility_type"] == "Cancer_Hospital").astype(int) * (df["category"] == "Oncology").astype(int)
    df["children_x_peds"] = (df["facility_type"] == "Children_Hospital").astype(int) * (df["category"].isin(["Pediatric", "Vaccine"])).astype(int)
    df["maternity_x_obgyn"] = (df["facility_type"] == "Maternity_Hospital").astype(int) * (df["category"] == "Maternity_OBGYN").astype(int)

    df["category_season_mult"] = [
        CATEGORY_SEASON.get(c, {}).get(int(m), 1.0) for c, m in zip(df["category"], df["month"])
    ]
    df["ecoregion_cat_mult"] = [
        ECOREGION_PRESSURE.get(e, {}).get(c, 1.0) for e, c in zip(df["ecoregion"], df["category"])
    ]
    df["specialty_mult"] = [
        specialty_mult(ft, c) for ft, c in zip(df["facility_type"], df["category"])
    ]

    df["month_sin"] = np.sin(2 * np.pi * df["month"] / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["month"] / 12)
    df["week_sin"] = np.sin(2 * np.pi * df["week_of_year"] / 52)
    df["week_cos"] = np.cos(2 * np.pi * df["week_of_year"] / 52)

    df = df.rename(columns={"demand_units": "target_demand"})
    df = df[df["week_start"] >= (pd.Timestamp(START_DATE) + pd.Timedelta(weeks=12))].copy()

    feature_fill = [c for c in df.columns if c.startswith(("lag_", "roll_", "diff_", "mom_", "yoy_", "ewm_"))]
    for c in feature_fill:
        df[c] = df[c].fillna(0)
    return df


def generate_inventory(hospitals: pd.DataFrame, medicines: pd.DataFrame, demand: pd.DataFrame) -> pd.DataFrame:
    print("Generating inventory snapshots...")
    demand = demand.copy()
    demand["week_start"] = pd.to_datetime(demand["week_start"])
    cutoff = pd.Timestamp(END_DATE) - pd.Timedelta(weeks=12)
    recent = demand[demand["week_start"] >= cutoff]
    avg = (
        recent.groupby(["hospital_id", "medicine_id"])["demand_units"]
        .mean()
        .reset_index()
        .rename(columns={"demand_units": "avg_weekly_use"})
    )
    avg["avg_daily_use"] = avg["avg_weekly_use"] / 7.0
    avg_map = {(r.hospital_id, r.medicine_id): r.avg_daily_use for r in avg.itertuples()}

    snapshot_date = END_DATE
    rows = []
    batch_counter = 0
    suppliers = [
        "DoDA Logistics", "Nepal CMS", "Provincial Medical Store",
        "Private Distributor - Kathmandu", "UNICEF Supply", "Local Pharmacy Wholesaler",
        "BPKMCH Pharmacy Store", "Kanti Central Store",
    ]

    for _, h in hospitals.iterrows():
        for _, m in medicines.iterrows():
            # Skip near-zero specialty mismatch stock sometimes
            sm = specialty_mult(h["facility_type"], m["category"])
            if sm < 0.2 and RNG.random() < 0.55:
                continue

            daily = float(avg_map.get((h["hospital_id"], m["medicine_id"]), max(0.1, sm)))
            cover_days = 45 if h["ecoregion"] == "Mountain" else (30 if h["ecoregion"] == "Hill" else 21)
            if h["facility_type"] == "Primary_Health_Center":
                cover_days = max(cover_days, 40)
            if h["facility_type"] == "Cancer_Hospital" and m["category"] == "Oncology":
                cover_days = 28

            # Demo hospitals: force diverse statuses for showcase
            force_near_expiry = h["is_demo"] == 1 and RNG.random() < 0.12
            force_low = h["is_demo"] == 1 and RNG.random() < 0.10
            force_surplus = h["is_demo"] == 1 and RNG.random() < 0.12

            mult = float(RNG.uniform(0.45, 1.7))
            if force_low:
                mult = float(RNG.uniform(0.05, 0.35))
            if force_surplus:
                mult = float(RNG.uniform(2.0, 3.5))

            target_qty = max(0, daily * cover_days * mult)
            n_batches = int(RNG.integers(1, 4))
            remaining = target_qty
            for b in range(n_batches):
                batch_counter += 1
                share = remaining if b == n_batches - 1 else remaining * float(RNG.uniform(0.25, 0.55))
                remaining -= share
                qty = max(0, int(round(share)))
                if qty == 0 and not (force_low and b == 0):
                    continue
                if qty == 0:
                    qty = max(1, int(daily * 2))

                shelf = int(m["shelf_life_months"])
                r = RNG.random()
                if force_near_expiry or r < 0.08:
                    days_to_exp = int(RNG.integers(7, 55))
                elif r < 0.18:
                    days_to_exp = int(RNG.integers(56, 120))
                else:
                    days_to_exp = int(RNG.integers(120, max(121, shelf * 30)))

                # blood products short life
                if m["category"] == "Blood_Product":
                    days_to_exp = int(RNG.integers(3, 35))

                expiry = snapshot_date + timedelta(days=days_to_exp)
                received = expiry - timedelta(days=int(max(7, shelf * 30 * float(RNG.uniform(0.4, 1.0)))))
                if received > snapshot_date:
                    received = snapshot_date - timedelta(days=int(RNG.integers(1, 45)))

                reorder = max(3, int(daily * 10))
                status = "OK"
                if qty <= reorder:
                    status = "LOW_STOCK"
                if days_to_exp <= 90:
                    status = "NEAR_EXPIRY" if status == "OK" else "LOW_AND_NEAR_EXPIRY"
                if qty == 0:
                    status = "OUT_OF_STOCK"

                rows.append({
                    "snapshot_date": snapshot_date.isoformat(),
                    "batch_id": f"BATCH-{batch_counter:06d}",
                    "hospital_id": h["hospital_id"],
                    "medicine_id": m["medicine_id"],
                    "quantity_units": qty,
                    "unit": m["unit"],
                    "unit_cost_npr": m["unit_cost_npr"],
                    "received_date": received.isoformat(),
                    "expiry_date": expiry.isoformat(),
                    "days_to_expiry": days_to_exp,
                    "reorder_level": reorder,
                    "avg_daily_use": round(daily, 3),
                    "days_of_cover": round(qty / daily, 2) if daily > 0 else None,
                    "stock_status": status,
                    "supplier": RNG.choice(suppliers),
                    "storage_condition": "Cold_Chain" if m["requires_cold_chain"] else "Ambient",
                })
    return pd.DataFrame(rows)


def haversine(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def generate_exchanges(inventory: pd.DataFrame, hospitals: pd.DataFrame, medicines: pd.DataFrame) -> pd.DataFrame:
    print("Generating resource exchange log...")
    inv = inventory.merge(
        hospitals[["hospital_id", "province", "latitude", "longitude", "is_demo", "facility_type"]],
        on="hospital_id", how="left",
    )
    surplus = inv[inv["days_of_cover"].fillna(0) > 35].copy()
    shortage = inv[
        inv["stock_status"].str.contains("LOW|OUT", regex=True)
        | (inv["days_of_cover"].fillna(999) < 10)
    ].copy()

    rows = []
    # Prioritize demo hospital exchanges for showcase
    demo_ids = set(hospitals.loc[hospitals["is_demo"] == 1, "hospital_id"])
    n = 500
    if len(surplus) == 0 or len(shortage) == 0:
        return pd.DataFrame()

    reasons = [
        "Low stock", "Emergency case load", "Near-expiry redistribution",
        "Monsoon surge", "Surgical camp", "Outbreak response", "Routine balancing",
        "Chemo cycle demand", "Pediatric surge", "Postpartum hemorrhage kit",
    ]

    for i in range(n):
        # 40% of exchanges involve demo hospitals
        if RNG.random() < 0.4:
            s_pool = surplus[surplus["hospital_id"].isin(demo_ids)]
            k_pool = shortage[shortage["hospital_id"].isin(demo_ids)]
            if len(s_pool) == 0:
                s_pool = surplus
            if len(k_pool) == 0:
                k_pool = shortage
        else:
            s_pool, k_pool = surplus, shortage

        s = s_pool.iloc[int(RNG.integers(0, len(s_pool)))]
        k = k_pool.iloc[int(RNG.integers(0, len(k_pool)))]
        if s["hospital_id"] == k["hospital_id"]:
            continue

        # Prefer matching medicine from surplus batch
        med = s["medicine_id"] if RNG.random() < 0.75 else k["medicine_id"]
        qty = int(max(5, min(s["quantity_units"] * 0.3, RNG.integers(10, 250))))
        dist = haversine(s["latitude"], s["longitude"], k["latitude"], k["longitude"])
        req_day = END_DATE - timedelta(days=int(RNG.integers(1, 200)))
        status = RNG.choice(
            ["Completed", "Completed", "Completed", "In_Transit", "Approved", "Rejected", "Requested"],
            p=[0.45, 0.15, 0.10, 0.10, 0.08, 0.05, 0.07],
        )
        priority = RNG.choice(["Normal", "High", "Emergency"], p=[0.55, 0.30, 0.15])
        lead = max(1, int(dist / 80) + int(RNG.integers(0, 3)))
        rows.append({
            "exchange_id": f"EX-{i+1:05d}",
            "request_date": req_day.isoformat(),
            "from_hospital_id": s["hospital_id"],
            "to_hospital_id": k["hospital_id"],
            "medicine_id": med,
            "quantity_units": qty,
            "priority": priority,
            "status": status,
            "distance_km": round(dist, 1),
            "estimated_lead_days": lead,
            "same_province": int(s["province"] == k["province"]),
            "reason": RNG.choice(reasons),
            "involves_demo": int(s["hospital_id"] in demo_ids or k["hospital_id"] in demo_ids),
        })
    return pd.DataFrame(rows)


def generate_emergencies(hospitals: pd.DataFrame, medicines: pd.DataFrame) -> pd.DataFrame:
    print("Generating emergency requests...")
    causes = [
        "Mass casualty", "Dengue surge", "Postpartum hemorrhage",
        "Road traffic accident", "Flood displacement camp", "Surgical emergency",
        "Neonatal sepsis", "Snake bite", "COPD exacerbation cluster",
        "Chemo stockout", "Pediatric pneumonia surge", "Blood shortage",
    ]
    rows = []
    demo = hospitals[hospitals["is_demo"] == 1]
    for i in range(200):
        h = (demo if RNG.random() < 0.5 else hospitals).sample(1, random_state=int(RNG.integers(0, 1e9))).iloc[0]
        m = medicines.sample(1, random_state=int(RNG.integers(0, 1e9))).iloc[0]
        d = END_DATE - timedelta(days=int(RNG.integers(1, 365)))
        severity = RNG.choice(["Critical", "High", "Medium"], p=[0.22, 0.43, 0.35])
        rows.append({
            "request_id": f"EMR-{i+1:04d}",
            "request_datetime": datetime.combine(d, datetime.min.time()).isoformat() + "Z",
            "hospital_id": h["hospital_id"],
            "medicine_id": m["medicine_id"],
            "quantity_requested": int(RNG.integers(5, 300)),
            "severity": severity,
            "cause": RNG.choice(causes),
            "status": RNG.choice(
                ["Fulfilled", "Partially_Fulfilled", "Open", "Cancelled"],
                p=[0.55, 0.2, 0.15, 0.1],
            ),
            "response_hours": round(float(RNG.uniform(1, 48 if severity != "Critical" else 18)), 1),
        })
    return pd.DataFrame(rows)


def write_demo_accounts(hospitals: pd.DataFrame):
    demo = hospitals[hospitals["is_demo"] == 1][
        ["hospital_id", "hospital_name", "facility_type", "province", "district",
         "ecoregion", "bed_capacity", "demo_username", "specialty_focus"]
    ].copy()
    demo["demo_password"] = "MedBridge@2026"
    demo["login_role"] = "hospital_admin"
    demo.to_csv(OUT_RAW / "demo_hospital_accounts.csv", index=False)
    return demo


def write_docs(hospitals, medicines, demand, features, inventory, exchanges, emergencies, demo):
    OUT_DOCS.mkdir(parents=True, exist_ok=True)
    demo_table = "\n".join(
        f"| `{r.hospital_id}` | {r.hospital_name} | {r.facility_type} | {r.demo_username} | `MedBridge@2026` |"
        for r in demo.itertuples()
    )
    text = f"""# MedBridge Synthetic Dataset (Nepal) — XGBoost Ready

**Period:** {START_DATE} → {END_DATE}  
**Granularity:** Weekly demand  
**Seed:** 42  

## 8 Demo hospital logins (final report)

| ID | Hospital | Type | Username | Password |
|----|----------|------|----------|----------|
{demo_table}

## Counts

| Dataset | Rows |
|---------|------|
| hospitals | {len(hospitals)} |
| medicines | {len(medicines)} |
| demand_history | {len(demand)} |
| demand_features | {len(features)} |
| inventory_snapshots | {len(inventory)} |
| resource_exchange_log | {len(exchanges)} |
| emergency_requests | {len(emergencies)} |

## Facility coverage

Central, Regional, Zonal, District, Teaching, PHC, Community, **Cancer**, **Children**, **Maternity**, **Eye**, **Trauma**, Mental, Private.

## Target

`target_demand` — weekly units for (hospital_id, medicine_id)

## Split

- Train ≤ 2025-12-29  
- Valid 2026-01-05 → 2026-03-30  
- Test ≥ 2026-04-06  
"""
    (OUT_DOCS / "data_dictionary.md").write_text(text, encoding="utf-8")
    (ROOT / "data" / "README.md").write_text(
        """# MedBridge ML Data

```bash
python training/generate_synthetic_data.py
python training/train_xgb.py
python training/demo_showcase.py
```

See `docs/data/data_dictionary.md` and `raw/demo_hospital_accounts.csv`.
""",
        encoding="utf-8",
    )


def main():
    global START_DATE, END_DATE
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default=str(START_DATE))
    parser.add_argument("--end", default=str(END_DATE))
    args = parser.parse_args()
    START_DATE = date.fromisoformat(args.start)
    END_DATE = date.fromisoformat(args.end)

    OUT_RAW.mkdir(parents=True, exist_ok=True)
    OUT_PROCESSED.mkdir(parents=True, exist_ok=True)

    hospitals = build_hospitals()
    medicines = build_medicines()
    hospitals.to_csv(OUT_RAW / "hospitals.csv", index=False)
    medicines.to_csv(OUT_RAW / "medicines.csv", index=False)
    demo = write_demo_accounts(hospitals)
    print(f"hospitals={len(hospitals)} (demo={demo.shape[0]}) medicines={len(medicines)}")

    demand = generate_demand_history(hospitals, medicines)
    demand.to_csv(OUT_RAW / "demand_history.csv", index=False)
    print(f"demand_history={len(demand)}")

    features = build_xgb_features(demand, hospitals, medicines)
    features.to_csv(OUT_PROCESSED / "demand_features.csv", index=False)
    print(f"demand_features={len(features)} cols={features.shape[1]}")

    inventory = generate_inventory(hospitals, medicines, demand)
    inventory.to_csv(OUT_RAW / "inventory_snapshots.csv", index=False)
    print(f"inventory={len(inventory)}")

    exchanges = generate_exchanges(inventory, hospitals, medicines)
    exchanges.to_csv(OUT_RAW / "resource_exchange_log.csv", index=False)
    print(f"exchanges={len(exchanges)}")

    emergencies = generate_emergencies(hospitals, medicines)
    emergencies.to_csv(OUT_RAW / "emergency_requests.csv", index=False)
    print(f"emergencies={len(emergencies)}")

    write_docs(hospitals, medicines, demand, features, inventory, exchanges, emergencies, demo)

    meta = {
        "n_hospitals": len(hospitals),
        "n_demo_hospitals": int(hospitals["is_demo"].sum()),
        "n_medicines": len(medicines),
        "n_demand_rows": len(demand),
        "n_feature_rows": len(features),
        "n_feature_cols": int(features.shape[1]),
        "granularity": "weekly",
        "date_start": str(START_DATE),
        "date_end": str(END_DATE),
        "target": "target_demand",
        "model": "XGBoostRegressor",
        "seed": 42,
    }
    (OUT_PROCESSED / "dataset_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print("Done.", meta)


if __name__ == "__main__":
    main()
