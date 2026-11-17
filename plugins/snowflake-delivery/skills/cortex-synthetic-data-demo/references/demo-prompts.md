# Synthetic Data Demo - Copy-Paste Prompts

## Add Bilingual Support

  Prompt to enable bilingual mode / Prompt para habilitar modo bilingüe:

    Respond in both English and Spanish simultaneously. Show English first, then Spanish in italics on the next line or in parentheses. Use this format consistently for all responses.

  Or shorter / O más corto:

    Bilingual mode: English + Spanish (español en cursiva)

## Predefined Demos (Optimized Scripts)

### Financial Fraud Detection
```
Generate synthetic data for financial fraud detection in ./fraud_demo with 10,000 records
```

### Logistics & Supply Chain
```
Generate synthetic data for logistics in ./logistics_demo with 10,000 records
```

### Healthcare
```
Generate synthetic data for healthcare in ./healthcare_demo with 10,000 records
```

### E-commerce
```
Generate synthetic data for ecommerce in ./ecommerce_demo with 10,000 records
```

---



## Tested & Verified Demos

### Clothing Company (Bilingual) ✓
```
Generate synthetic data for a clothing company in ./clothing_company with bilingual Spanish/English demo dashboard
```
*Verified working. Creates: stores, products, customers, orders, order_items tables with 1,000+ orders.*

---

## Industry Demos (Custom Generated)

### Retail & Consumer

#### Grocery Store Chain
```
Generate synthetic data for a grocery store chain in ./grocery_demo with stores, products, inventory, sales transactions, and customer loyalty data
```

#### Fashion Retail (Bilingual)
```
Generate synthetic data for fashion retail in ./fashion_demo with bilingual Spanish/English demo dashboard, including stores across Latin America, clothing products, customers, and orders
```

#### Restaurant Chain
```
Generate synthetic data for a restaurant chain in ./restaurant_demo with locations, menu items, orders, customer reviews, and staff scheduling
```

---

### Financial Services

#### Banking
```
Generate synthetic data for retail banking in ./banking_demo with customers, accounts, transactions, loans, and branch locations
```

#### Insurance Claims
```
Generate synthetic data for insurance claims in ./insurance_demo with policies, customers, claims, adjusters, and payouts
```

#### Wealth Management
```
Generate synthetic data for wealth management in ./wealth_demo with clients, portfolios, holdings, transactions, and advisors
```

---

### Healthcare & Life Sciences

#### Hospital Network
```
Generate synthetic data for a hospital network in ./hospital_demo with facilities, patients, admissions, doctors, procedures, and billing
```

#### Pharmaceutical Sales
```
Generate synthetic data for pharmaceutical sales in ./pharma_demo with drugs, territories, sales reps, prescribers, and prescription volumes
```

#### Clinical Trials
```
Generate synthetic data for clinical trials in ./trials_demo with studies, sites, patients, visits, adverse events, and outcomes
```

---

### Manufacturing & Industrial

#### Factory Operations
```
Generate synthetic data for factory operations in ./factory_demo with production lines, machines, work orders, quality inspections, and maintenance logs
```

#### Automotive Supply Chain
```
Generate synthetic data for automotive supply chain in ./auto_demo with suppliers, parts, shipments, assembly plants, and quality metrics
```

#### Energy & Utilities
```
Generate synthetic data for energy utilities in ./energy_demo with power plants, meters, consumption readings, outages, and service requests
```

---

### Technology & Media

#### SaaS Platform
```
Generate synthetic data for a SaaS platform in ./saas_demo with tenants, users, subscriptions, feature usage, and support tickets
```

#### Streaming Service
```
Generate synthetic data for a streaming service in ./streaming_demo with content catalog, users, viewing history, recommendations, and subscriptions
```

#### Gaming Platform
```
Generate synthetic data for a gaming platform in ./gaming_demo with games, players, sessions, achievements, and in-app purchases
```

---

### Travel & Hospitality

#### Airline Operations
```
Generate synthetic data for airline operations in ./airline_demo with airports, flights, passengers, bookings, delays, and crew schedules
```

#### Hotel Chain
```
Generate synthetic data for a hotel chain in ./hotel_demo with properties, rooms, reservations, guests, amenities, and reviews
```

#### Car Rental
```
Generate synthetic data for car rental in ./rental_demo with locations, vehicles, reservations, customers, and maintenance records
```

---

### Public Sector

#### City Services
```
Generate synthetic data for city services in ./city_demo with departments, service requests, inspections, permits, and citizen feedback
```

#### Education District
```
Generate synthetic data for an education district in ./education_demo with schools, students, teachers, courses, grades, and attendance
```

---

## Regional/Language Variants

### Latin America (Spanish/English Bilingual)
```
Generate synthetic data for Latin American retail in ./latam_retail with bilingual demo dashboard, stores in Mexico, Colombia, Argentina, and Brazil, with 15,000 records
```

### Colombia Focus
```
Generate synthetic data for Colombian coffee exports in ./colombia_coffee with bilingual Spanish/English demo dashboard, farms, harvests, processing, exports, and buyers
```

### Mexico Manufacturing
```
Generate synthetic data for Mexico manufacturing in ./mexico_mfg with bilingual demo dashboard, maquiladora plants, workers, production runs, and quality data
```

---

## Scale Variants

### Quick Demo (Small)
```
Generate synthetic data for a quick retail demo in ./quick_demo with 500 records for a fast demonstration
```

### Standard Demo
```
Generate synthetic data for retail in ./standard_demo with 10,000 records
```

### Large Scale Demo
```
Generate synthetic data for retail in ./large_demo with 100,000 records for realistic performance testing
```

---

## Tips

- All prompts create self-contained projects with data + dashboard
- Bilingual dashboards include an in-app language toggle
- Record counts can be adjusted by changing the number
- Custom domains auto-generate appropriate schemas
- Dashboards deploy to Snowflake automatically
