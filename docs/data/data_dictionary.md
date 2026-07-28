# MedBridge Synthetic Dataset (Nepal) — XGBoost Ready

**Period:** 2023-01-02 → 2026-06-30  
**Granularity:** Weekly demand  
**Seed:** 42  

## 8 Demo hospital logins (final report)

| ID | Hospital | Type | Username | Password |
|----|----------|------|----------|----------|
| `DEMO-01` | Bir Hospital | Central_Hospital | demo_01 | `MedBridge@2026` |
| `DEMO-02` | Tribhuvan University Teaching Hospital (TUTH) | Teaching_Hospital | demo_02 | `MedBridge@2026` |
| `DEMO-03` | Bhaktapur Cancer Hospital | Cancer_Hospital | demo_03 | `MedBridge@2026` |
| `DEMO-04` | Kanti Children's Hospital | Children_Hospital | demo_04 | `MedBridge@2026` |
| `DEMO-05` | Paropakar Maternity & Women's Hospital | Maternity_Hospital | demo_05 | `MedBridge@2026` |
| `DEMO-06` | Koshi Hospital | Regional_Hospital | demo_06 | `MedBridge@2026` |
| `DEMO-07` | Pokhara Academy of Health Sciences | Regional_Hospital | demo_07 | `MedBridge@2026` |
| `DEMO-08` | Jumla District Hospital | District_Hospital | demo_08 | `MedBridge@2026` |

## Counts

| Dataset | Rows |
|---------|------|
| hospitals | 41 |
| medicines | 72 |
| demand_history | 540216 |
| demand_features | 504792 |
| inventory_snapshots | 5660 |
| resource_exchange_log | 472 |
| emergency_requests | 200 |

## Facility coverage

Central, Regional, Zonal, District, Teaching, PHC, Community, **Cancer**, **Children**, **Maternity**, **Eye**, **Trauma**, Mental, Private.

## Target

`target_demand` — weekly units for (hospital_id, medicine_id)

## Split

- Train ≤ 2025-12-29  
- Valid 2026-01-05 → 2026-03-30  
- Test ≥ 2026-04-06  
