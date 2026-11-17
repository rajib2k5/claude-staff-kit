#!/usr/bin/env python3
"""
generate_data.py - Generate synthetic CSV data with relational integrity.

Usage:
    uv run --project <SKILL_DIR> python <SKILL_DIR>/scripts/generate_data.py \
        --config ./synthetic_data_config.json \
        --output-dir ./output
"""

import argparse
import json
import os
import random
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from faker import Faker

fake = Faker()
# Use random seeds for variety in data generation
Faker.seed(None)
random.seed()


def generate_financial_fraud_data(num_records: int, output_dir: Path):
    """Generate financial fraud detection dataset."""
    
    # Generate customers (1/10 of transactions)
    num_customers = max(100, num_records // 10)
    customers = []
    for _ in range(num_customers):
        customers.append({
            "customer_id": str(uuid.uuid4()),
            "first_name": fake.first_name(),
            "last_name": fake.last_name(),
            "email": fake.email(),
            "phone": fake.phone_number(),
            "address": fake.street_address(),
            "city": fake.city(),
            "state": fake.state_abbr(),
            "country": fake.country(),
            "account_created": fake.date_time_between(start_date="-3y", end_date="-1m").isoformat(),
            "credit_score": random.randint(300, 850),
        })
    
    # Generate merchants (1/50 of transactions)
    num_merchants = max(50, num_records // 50)
    categories = ["retail", "food_dining", "travel", "entertainment", "utilities", "healthcare", "gas_station", "online_shopping"]
    merchants = []
    for _ in range(num_merchants):
        merchants.append({
            "merchant_id": str(uuid.uuid4()),
            "merchant_name": fake.company(),
            "category": random.choice(categories),
            "city": fake.city(),
            "country": fake.country(),
            "risk_score": round(random.uniform(0.0, 1.0), 2),
        })
    
    # Generate transactions
    transaction_types = ["purchase", "refund", "transfer"]
    channels = ["online", "in_store", "mobile", "atm"]
    device_types = ["desktop", "mobile", "tablet", "pos"]
    
    transactions = []
    fraud_labels = []
    
    for _ in range(num_records):
        customer = random.choice(customers)
        merchant = random.choice(merchants)
        is_fraud = random.random() < 0.03  # 3% fraud rate
        
        trans_id = str(uuid.uuid4())
        trans_date = fake.date_time_between(start_date="-1y", end_date="now")
        
        # Fraudulent transactions tend to be larger
        if is_fraud:
            amount = round(random.uniform(500, 5000), 2)
        else:
            amount = round(random.uniform(5, 500), 2)
        
        transactions.append({
            "transaction_id": trans_id,
            "customer_id": customer["customer_id"],
            "merchant_id": merchant["merchant_id"],
            "amount": amount,
            "currency": "USD",
            "transaction_date": trans_date.isoformat(),
            "transaction_type": random.choice(transaction_types),
            "channel": random.choice(channels),
            "device_type": random.choice(device_types),
            "ip_address": fake.ipv4() if random.random() > 0.3 else "",
            "location_lat": round(fake.latitude(), 8),
            "location_lon": round(fake.longitude(), 8),
        })
        
        fraud_type = ""
        if is_fraud:
            fraud_type = random.choice(["card_theft", "account_takeover", "identity_fraud", "friendly_fraud"])
        
        fraud_labels.append({
            "label_id": str(uuid.uuid4()),
            "transaction_id": trans_id,
            "is_fraud": is_fraud,
            "fraud_type": fraud_type,
            "confidence_score": round(random.uniform(0.7, 0.99), 2) if is_fraud else round(random.uniform(0.01, 0.3), 2),
            "flagged_date": (trans_date + timedelta(hours=random.randint(1, 72))).isoformat() if is_fraud else "",
        })
    
    # Write CSVs
    data_dir = output_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    
    write_csv(data_dir / "customers.csv", customers)
    write_csv(data_dir / "merchants.csv", merchants)
    write_csv(data_dir / "transactions.csv", transactions)
    write_csv(data_dir / "fraud_labels.csv", fraud_labels)
    
    return {
        "customers": len(customers),
        "merchants": len(merchants),
        "transactions": len(transactions),
        "fraud_labels": len(fraud_labels),
    }


def generate_logistics_data(num_records: int, output_dir: Path):
    """Generate logistics and shipping dataset."""
    
    # Generate warehouses
    num_warehouses = max(10, num_records // 500)
    warehouses = []
    for _ in range(num_warehouses):
        warehouses.append({
            "warehouse_id": str(uuid.uuid4()),
            "warehouse_name": f"{fake.city()} Distribution Center",
            "address": fake.street_address(),
            "city": fake.city(),
            "state": fake.state_abbr(),
            "country": "USA",
            "capacity_sqft": random.randint(50000, 500000),
            "manager_name": fake.name(),
        })
    
    # Generate routes
    num_routes = max(50, num_records // 100)
    transport_modes = ["ground", "air", "sea", "rail"]
    routes = []
    for _ in range(num_routes):
        warehouse = random.choice(warehouses)
        routes.append({
            "route_id": str(uuid.uuid4()),
            "origin_warehouse_id": warehouse["warehouse_id"],
            "destination_city": fake.city(),
            "destination_country": fake.country(),
            "distance_miles": round(random.uniform(50, 3000), 2),
            "estimated_days": random.randint(1, 14),
            "transport_mode": random.choice(transport_modes),
        })
    
    # Generate shipments
    priorities = ["standard", "express", "overnight"]
    shipments = []
    deliveries = []
    
    # Generate dates spread over last 6 months
    # Uses ISO 8601 format (YYYY-MM-DDTHH:MM:SS) which Snowflake parses automatically
    now = datetime.now()
    six_months_ago = now - timedelta(days=180)
    
    for _ in range(num_records):
        route = random.choice(routes)
        ship_id = str(uuid.uuid4())
        
        # Generate random date within range
        random_days = random.randint(0, 180)
        ship_date = six_months_ago + timedelta(days=random_days, hours=random.randint(0,23), minutes=random.randint(0,59))
        
        expected_days = route["estimated_days"] + random.randint(-1, 2)
        expected_delivery = ship_date + timedelta(days=max(1, expected_days))
        
        shipments.append({
            "shipment_id": ship_id,
            "route_id": route["route_id"],
            "customer_name": fake.name(),
            "customer_email": fake.email(),
            "ship_date": ship_date.isoformat(),
            "expected_delivery": expected_delivery.isoformat(),
            "weight_lbs": round(random.uniform(0.5, 100), 2),
            "dimensions": f"{random.randint(5,30)}x{random.randint(5,30)}x{random.randint(5,30)}",
            "shipping_cost": round(random.uniform(5, 200), 2),
            "priority": random.choice(priorities),
        })
        
        # 95% delivered, 3% returned, 1% lost, 1% damaged
        status_roll = random.random()
        if status_roll < 0.95:
            status = "delivered"
            delay_days = random.randint(-2, 3)
        elif status_roll < 0.98:
            status = "returned"
            delay_days = random.randint(5, 15)
        elif status_roll < 0.99:
            status = "lost"
            delay_days = 0
        else:
            status = "damaged"
            delay_days = random.randint(0, 5)
        
        actual_delivery = expected_delivery + timedelta(days=delay_days) if status != "lost" else None
        
        deliveries.append({
            "delivery_id": str(uuid.uuid4()),
            "shipment_id": ship_id,
            "actual_delivery": actual_delivery.isoformat() if actual_delivery else "",
            "delivery_status": status,
            "recipient_name": fake.name() if status == "delivered" else "",
            "signature_captured": status == "delivered" and random.random() > 0.2,
            "delivery_notes": fake.sentence() if status in ["returned", "damaged"] else "",
        })
    
    data_dir = output_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    
    write_csv(data_dir / "warehouses.csv", warehouses)
    write_csv(data_dir / "routes.csv", routes)
    write_csv(data_dir / "shipments.csv", shipments)
    write_csv(data_dir / "deliveries.csv", deliveries)
    
    return {
        "warehouses": len(warehouses),
        "routes": len(routes),
        "shipments": len(shipments),
        "deliveries": len(deliveries),
    }


def generate_healthcare_data(num_records: int, output_dir: Path):
    """Generate healthcare records dataset."""
    
    # Generate patients
    num_patients = max(100, num_records // 5)
    blood_types = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
    insurance_providers = ["BlueCross", "Aetna", "UnitedHealth", "Cigna", "Humana", "Kaiser"]
    
    patients = []
    for _ in range(num_patients):
        patients.append({
            "patient_id": str(uuid.uuid4()),
            "first_name": fake.first_name(),
            "last_name": fake.last_name(),
            "date_of_birth": fake.date_of_birth(minimum_age=1, maximum_age=90).isoformat(),
            "gender": random.choice(["Male", "Female", "Other"]),
            "blood_type": random.choice(blood_types),
            "phone": fake.phone_number(),
            "email": fake.email(),
            "address": fake.address().replace("\n", ", "),
            "insurance_provider": random.choice(insurance_providers),
            "insurance_id": fake.bothify(text="???########"),
        })
    
    # Generate visits
    visit_types = ["routine", "emergency", "follow_up", "specialist"]
    departments = ["Primary Care", "Emergency", "Cardiology", "Orthopedics", "Dermatology", "Pediatrics"]
    
    visits = []
    diagnoses = []
    prescriptions = []
    
    # Common diagnoses with ICD-10 codes
    diagnosis_options = [
        ("J06.9", "Acute upper respiratory infection"),
        ("M54.5", "Low back pain"),
        ("I10", "Essential hypertension"),
        ("E11.9", "Type 2 diabetes mellitus"),
        ("J45.909", "Unspecified asthma"),
        ("F32.9", "Major depressive disorder"),
        ("K21.0", "Gastroesophageal reflux disease"),
        ("M79.3", "Panniculitis, unspecified"),
    ]
    
    medications = ["Lisinopril", "Metformin", "Omeprazole", "Amoxicillin", "Ibuprofen", "Atorvastatin", "Albuterol", "Sertraline"]
    
    for _ in range(num_records):
        patient = random.choice(patients)
        visit_id = str(uuid.uuid4())
        visit_date = fake.date_time_between(start_date="-1y", end_date="now")
        
        visits.append({
            "visit_id": visit_id,
            "patient_id": patient["patient_id"],
            "visit_date": visit_date.isoformat(),
            "visit_type": random.choice(visit_types),
            "department": random.choice(departments),
            "provider_name": f"Dr. {fake.last_name()}",
            "chief_complaint": fake.sentence(nb_words=6),
            "visit_duration_min": random.randint(10, 90),
            "copay_amount": random.choice([0, 20, 25, 30, 50, 75]),
        })
        
        # 1-3 diagnoses per visit
        num_diagnoses = random.randint(1, 3)
        for i in range(num_diagnoses):
            diag = random.choice(diagnosis_options)
            diagnoses.append({
                "diagnosis_id": str(uuid.uuid4()),
                "visit_id": visit_id,
                "icd_code": diag[0],
                "diagnosis_name": diag[1],
                "severity": random.choice(["mild", "moderate", "severe"]),
                "is_primary": i == 0,
            })
        
        # 60% chance of prescription
        if random.random() < 0.6:
            prescriptions.append({
                "prescription_id": str(uuid.uuid4()),
                "visit_id": visit_id,
                "medication_name": random.choice(medications),
                "dosage": f"{random.choice([5, 10, 20, 50, 100, 250, 500])}mg",
                "frequency": random.choice(["Once daily", "Twice daily", "Three times daily", "As needed"]),
                "duration_days": random.choice([7, 14, 30, 60, 90]),
                "refills_allowed": random.randint(0, 5),
                "prescribed_date": visit_date.date().isoformat(),
            })
    
    data_dir = output_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    
    write_csv(data_dir / "patients.csv", patients)
    write_csv(data_dir / "visits.csv", visits)
    write_csv(data_dir / "diagnoses.csv", diagnoses)
    write_csv(data_dir / "prescriptions.csv", prescriptions)
    
    return {
        "patients": len(patients),
        "visits": len(visits),
        "diagnoses": len(diagnoses),
        "prescriptions": len(prescriptions),
    }


def generate_ecommerce_data(num_records: int, output_dir: Path):
    """Generate e-commerce transactions dataset."""
    
    # Generate customers
    num_customers = max(100, num_records // 5)
    segments = ["new", "returning", "vip"]
    
    customers = []
    for _ in range(num_customers):
        customers.append({
            "customer_id": str(uuid.uuid4()),
            "first_name": fake.first_name(),
            "last_name": fake.last_name(),
            "email": fake.email(),
            "phone": fake.phone_number(),
            "address": fake.street_address(),
            "city": fake.city(),
            "state": fake.state_abbr(),
            "country": fake.country(),
            "registration_date": fake.date_time_between(start_date="-2y", end_date="-1m").isoformat(),
            "customer_segment": random.choice(segments),
        })
    
    # Generate products
    num_products = max(50, num_records // 20)
    categories = {
        "Electronics": ["Smartphones", "Laptops", "Headphones", "Cameras"],
        "Clothing": ["Shirts", "Pants", "Dresses", "Shoes"],
        "Home": ["Furniture", "Decor", "Kitchen", "Bedding"],
        "Sports": ["Fitness", "Outdoor", "Team Sports", "Water Sports"],
    }
    brands = ["TechPro", "StyleCo", "HomeEssentials", "SportMax", "ValueBrand", "PremiumLine"]
    
    products = []
    for _ in range(num_products):
        category = random.choice(list(categories.keys()))
        subcategory = random.choice(categories[category])
        price = round(random.uniform(10, 500), 2)
        products.append({
            "product_id": str(uuid.uuid4()),
            "product_name": f"{fake.word().title()} {subcategory} {random.randint(100, 999)}",
            "category": category,
            "subcategory": subcategory,
            "brand": random.choice(brands),
            "price": price,
            "cost": round(price * random.uniform(0.4, 0.7), 2),
            "stock_quantity": random.randint(0, 500),
            "rating": round(random.uniform(2.5, 5.0), 1),
        })
    
    # Generate orders
    statuses = ["pending", "shipped", "delivered", "cancelled"]
    shipping_methods = ["standard", "express", "overnight", "pickup"]
    payment_methods = ["credit_card", "debit_card", "paypal", "apple_pay", "google_pay"]
    
    orders = []
    order_items = []
    
    for _ in range(num_records):
        customer = random.choice(customers)
        order_id = str(uuid.uuid4())
        order_date = fake.date_time_between(start_date="-1y", end_date="now")
        
        # Generate 1-5 items per order
        num_items = random.randint(1, 5)
        order_products = random.sample(products, min(num_items, len(products)))
        
        subtotal = 0
        for product in order_products:
            quantity = random.randint(1, 3)
            line_total = round(product["price"] * quantity, 2)
            subtotal += line_total
            
            order_items.append({
                "item_id": str(uuid.uuid4()),
                "order_id": order_id,
                "product_id": product["product_id"],
                "quantity": quantity,
                "unit_price": product["price"],
                "line_total": line_total,
            })
        
        shipping_cost = round(random.uniform(0, 25), 2)
        tax_amount = round(subtotal * 0.08, 2)
        discount = round(subtotal * random.uniform(0, 0.2), 2) if random.random() < 0.3 else 0
        
        orders.append({
            "order_id": order_id,
            "customer_id": customer["customer_id"],
            "order_date": order_date.isoformat(),
            "status": random.choices(statuses, weights=[0.1, 0.2, 0.65, 0.05])[0],
            "shipping_method": random.choice(shipping_methods),
            "shipping_cost": shipping_cost,
            "tax_amount": tax_amount,
            "discount_amount": discount,
            "total_amount": round(subtotal + shipping_cost + tax_amount - discount, 2),
            "payment_method": random.choice(payment_methods),
        })
    
    data_dir = output_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    
    write_csv(data_dir / "customers.csv", customers)
    write_csv(data_dir / "products.csv", products)
    write_csv(data_dir / "orders.csv", orders)
    write_csv(data_dir / "order_items.csv", order_items)
    
    return {
        "customers": len(customers),
        "products": len(products),
        "orders": len(orders),
        "order_items": len(order_items),
    }


def write_csv(filepath: Path, data: list):
    """Write list of dicts to CSV file."""
    if not data:
        return
    
    import csv
    
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)
    
    print(f"  Written: {filepath.name} ({len(data)} rows)")


def main():
    parser = argparse.ArgumentParser(description="Generate synthetic CSV data")
    parser.add_argument("--config", required=True, help="Path to config JSON file")
    parser.add_argument("--output-dir", required=True, help="Output directory")
    args = parser.parse_args()
    
    # Load config
    with open(args.config, 'r') as f:
        config = json.load(f)
    
    dataset_type = config.get('dataset_type', 'ecommerce')
    num_records = config.get('num_records') or config.get('record_count', 1000)
    output_dir = Path(args.output_dir)
    
    print(f"Generating {dataset_type} dataset with {num_records} records...")
    print("")
    
    generators = {
        "financial_fraud": generate_financial_fraud_data,
        "logistics": generate_logistics_data,
        "healthcare": generate_healthcare_data,
        "ecommerce": generate_ecommerce_data,
        "custom": generate_ecommerce_data,  # Default to ecommerce for custom
    }
    
    generator = generators.get(dataset_type, generate_ecommerce_data)
    summary = generator(num_records, output_dir)
    
    print("")
    print("Generation complete!")
    print("")
    print("Summary:")
    for table, count in summary.items():
        print(f"  {table}: {count} rows")


if __name__ == "__main__":
    main()
