#!/usr/bin/env python3
"""
generate_schema.py - Generate relational schema documentation for synthetic datasets.

Usage:
    uv run --project <SKILL_DIR> python <SKILL_DIR>/scripts/generate_schema.py \
        --config ./synthetic_data_config.json \
        --output-dir ./output
"""

import argparse
import json
import os
from pathlib import Path

SCHEMAS = {
    "financial_fraud": {
        "name": "Financial Fraud Detection Dataset",
        "description": "A relational dataset for detecting fraudulent financial transactions.",
        "tables": {
            "customers": {
                "description": "Customer account information",
                "columns": [
                    ("customer_id", "VARCHAR(36)", "PRIMARY KEY", "Unique customer identifier"),
                    ("first_name", "VARCHAR(100)", "", "Customer first name"),
                    ("last_name", "VARCHAR(100)", "", "Customer last name"),
                    ("email", "VARCHAR(255)", "", "Customer email address"),
                    ("phone", "VARCHAR(50)", "", "Customer phone number"),
                    ("address", "VARCHAR(500)", "", "Customer address"),
                    ("city", "VARCHAR(100)", "", "City"),
                    ("state", "VARCHAR(50)", "", "State/Province"),
                    ("country", "VARCHAR(100)", "", "Country"),
                    ("account_created", "TIMESTAMP", "", "Account creation date"),
                    ("credit_score", "INTEGER", "", "Customer credit score (300-850)"),
                ]
            },
            "merchants": {
                "description": "Merchant/vendor information",
                "columns": [
                    ("merchant_id", "VARCHAR(36)", "PRIMARY KEY", "Unique merchant identifier"),
                    ("merchant_name", "VARCHAR(255)", "", "Business name"),
                    ("category", "VARCHAR(100)", "", "Business category (retail, food, travel, etc.)"),
                    ("city", "VARCHAR(100)", "", "Merchant city"),
                    ("country", "VARCHAR(100)", "", "Merchant country"),
                    ("risk_score", "DECIMAL(3,2)", "", "Merchant risk score (0.00-1.00)"),
                ]
            },
            "transactions": {
                "description": "Financial transactions",
                "columns": [
                    ("transaction_id", "VARCHAR(36)", "PRIMARY KEY", "Unique transaction identifier"),
                    ("customer_id", "VARCHAR(36)", "FOREIGN KEY → customers", "Customer who made the transaction"),
                    ("merchant_id", "VARCHAR(36)", "FOREIGN KEY → merchants", "Merchant receiving payment"),
                    ("amount", "DECIMAL(12,2)", "", "Transaction amount in USD"),
                    ("currency", "VARCHAR(3)", "", "Currency code"),
                    ("transaction_date", "TIMESTAMP", "", "Date and time of transaction"),
                    ("transaction_type", "VARCHAR(50)", "", "Type: purchase, refund, transfer"),
                    ("channel", "VARCHAR(50)", "", "Channel: online, in_store, mobile, atm"),
                    ("device_type", "VARCHAR(50)", "", "Device used: desktop, mobile, tablet, pos"),
                    ("ip_address", "VARCHAR(45)", "", "IP address for online transactions"),
                    ("location_lat", "DECIMAL(10,8)", "", "Transaction latitude"),
                    ("location_lon", "DECIMAL(11,8)", "", "Transaction longitude"),
                ]
            },
            "fraud_labels": {
                "description": "Fraud classification labels",
                "columns": [
                    ("label_id", "VARCHAR(36)", "PRIMARY KEY", "Unique label identifier"),
                    ("transaction_id", "VARCHAR(36)", "FOREIGN KEY → transactions", "Associated transaction"),
                    ("is_fraud", "BOOLEAN", "", "True if transaction is fraudulent"),
                    ("fraud_type", "VARCHAR(100)", "", "Type of fraud if applicable"),
                    ("confidence_score", "DECIMAL(3,2)", "", "Model confidence (0.00-1.00)"),
                    ("flagged_date", "TIMESTAMP", "", "When the fraud was detected/flagged"),
                ]
            }
        },
        "relationships": [
            ("transactions", "customer_id", "customers", "customer_id"),
            ("transactions", "merchant_id", "merchants", "merchant_id"),
            ("fraud_labels", "transaction_id", "transactions", "transaction_id"),
        ]
    },
    "logistics": {
        "name": "Logistics & Shipping Dataset",
        "description": "A relational dataset for tracking shipments and delivery performance.",
        "tables": {
            "warehouses": {
                "description": "Warehouse/distribution center information",
                "columns": [
                    ("warehouse_id", "VARCHAR(36)", "PRIMARY KEY", "Unique warehouse identifier"),
                    ("warehouse_name", "VARCHAR(255)", "", "Warehouse name"),
                    ("address", "VARCHAR(500)", "", "Warehouse address"),
                    ("city", "VARCHAR(100)", "", "City"),
                    ("state", "VARCHAR(50)", "", "State/Province"),
                    ("country", "VARCHAR(100)", "", "Country"),
                    ("capacity_sqft", "INTEGER", "", "Warehouse capacity in square feet"),
                    ("manager_name", "VARCHAR(200)", "", "Warehouse manager"),
                ]
            },
            "routes": {
                "description": "Shipping routes between locations",
                "columns": [
                    ("route_id", "VARCHAR(36)", "PRIMARY KEY", "Unique route identifier"),
                    ("origin_warehouse_id", "VARCHAR(36)", "FOREIGN KEY → warehouses", "Starting warehouse"),
                    ("destination_city", "VARCHAR(100)", "", "Destination city"),
                    ("destination_country", "VARCHAR(100)", "", "Destination country"),
                    ("distance_miles", "DECIMAL(10,2)", "", "Route distance in miles"),
                    ("estimated_days", "INTEGER", "", "Estimated transit days"),
                    ("transport_mode", "VARCHAR(50)", "", "Mode: ground, air, sea, rail"),
                ]
            },
            "shipments": {
                "description": "Individual shipment records",
                "columns": [
                    ("shipment_id", "VARCHAR(36)", "PRIMARY KEY", "Unique shipment identifier"),
                    ("route_id", "VARCHAR(36)", "FOREIGN KEY → routes", "Route used for shipment"),
                    ("customer_name", "VARCHAR(200)", "", "Customer name"),
                    ("customer_email", "VARCHAR(255)", "", "Customer email"),
                    ("ship_date", "TIMESTAMP", "", "Shipment date"),
                    ("expected_delivery", "TIMESTAMP", "", "Expected delivery date"),
                    ("weight_lbs", "DECIMAL(10,2)", "", "Package weight in pounds"),
                    ("dimensions", "VARCHAR(50)", "", "Package dimensions (LxWxH)"),
                    ("shipping_cost", "DECIMAL(10,2)", "", "Shipping cost in USD"),
                    ("priority", "VARCHAR(20)", "", "Priority: standard, express, overnight"),
                ]
            },
            "deliveries": {
                "description": "Delivery completion records",
                "columns": [
                    ("delivery_id", "VARCHAR(36)", "PRIMARY KEY", "Unique delivery identifier"),
                    ("shipment_id", "VARCHAR(36)", "FOREIGN KEY → shipments", "Associated shipment"),
                    ("actual_delivery", "TIMESTAMP", "", "Actual delivery timestamp"),
                    ("delivery_status", "VARCHAR(50)", "", "Status: delivered, returned, lost, damaged"),
                    ("recipient_name", "VARCHAR(200)", "", "Person who received the package"),
                    ("signature_captured", "BOOLEAN", "", "Whether signature was captured"),
                    ("delivery_notes", "VARCHAR(500)", "", "Delivery notes or issues"),
                ]
            }
        },
        "relationships": [
            ("routes", "origin_warehouse_id", "warehouses", "warehouse_id"),
            ("shipments", "route_id", "routes", "route_id"),
            ("deliveries", "shipment_id", "shipments", "shipment_id"),
        ]
    },
    "healthcare": {
        "name": "Healthcare Records Dataset",
        "description": "A relational dataset for patient visits and medical records.",
        "tables": {
            "patients": {
                "description": "Patient demographic information",
                "columns": [
                    ("patient_id", "VARCHAR(36)", "PRIMARY KEY", "Unique patient identifier"),
                    ("first_name", "VARCHAR(100)", "", "Patient first name"),
                    ("last_name", "VARCHAR(100)", "", "Patient last name"),
                    ("date_of_birth", "DATE", "", "Date of birth"),
                    ("gender", "VARCHAR(20)", "", "Gender"),
                    ("blood_type", "VARCHAR(5)", "", "Blood type"),
                    ("phone", "VARCHAR(50)", "", "Phone number"),
                    ("email", "VARCHAR(255)", "", "Email address"),
                    ("address", "VARCHAR(500)", "", "Home address"),
                    ("insurance_provider", "VARCHAR(200)", "", "Insurance provider name"),
                    ("insurance_id", "VARCHAR(50)", "", "Insurance ID number"),
                ]
            },
            "visits": {
                "description": "Patient visit records",
                "columns": [
                    ("visit_id", "VARCHAR(36)", "PRIMARY KEY", "Unique visit identifier"),
                    ("patient_id", "VARCHAR(36)", "FOREIGN KEY → patients", "Patient who visited"),
                    ("visit_date", "TIMESTAMP", "", "Visit date and time"),
                    ("visit_type", "VARCHAR(50)", "", "Type: routine, emergency, follow_up, specialist"),
                    ("department", "VARCHAR(100)", "", "Department visited"),
                    ("provider_name", "VARCHAR(200)", "", "Healthcare provider name"),
                    ("chief_complaint", "VARCHAR(500)", "", "Primary reason for visit"),
                    ("visit_duration_min", "INTEGER", "", "Visit duration in minutes"),
                    ("copay_amount", "DECIMAL(10,2)", "", "Copay amount in USD"),
                ]
            },
            "diagnoses": {
                "description": "Diagnosis codes and descriptions",
                "columns": [
                    ("diagnosis_id", "VARCHAR(36)", "PRIMARY KEY", "Unique diagnosis identifier"),
                    ("visit_id", "VARCHAR(36)", "FOREIGN KEY → visits", "Associated visit"),
                    ("icd_code", "VARCHAR(20)", "", "ICD-10 diagnosis code"),
                    ("diagnosis_name", "VARCHAR(500)", "", "Diagnosis description"),
                    ("severity", "VARCHAR(20)", "", "Severity: mild, moderate, severe"),
                    ("is_primary", "BOOLEAN", "", "Whether this is the primary diagnosis"),
                ]
            },
            "prescriptions": {
                "description": "Medication prescriptions",
                "columns": [
                    ("prescription_id", "VARCHAR(36)", "PRIMARY KEY", "Unique prescription identifier"),
                    ("visit_id", "VARCHAR(36)", "FOREIGN KEY → visits", "Associated visit"),
                    ("medication_name", "VARCHAR(200)", "", "Medication name"),
                    ("dosage", "VARCHAR(100)", "", "Dosage instructions"),
                    ("frequency", "VARCHAR(100)", "", "How often to take"),
                    ("duration_days", "INTEGER", "", "Prescription duration in days"),
                    ("refills_allowed", "INTEGER", "", "Number of refills allowed"),
                    ("prescribed_date", "DATE", "", "Date prescribed"),
                ]
            }
        },
        "relationships": [
            ("visits", "patient_id", "patients", "patient_id"),
            ("diagnoses", "visit_id", "visits", "visit_id"),
            ("prescriptions", "visit_id", "visits", "visit_id"),
        ]
    },
    "ecommerce": {
        "name": "E-commerce Transactions Dataset",
        "description": "A relational dataset for online retail transactions.",
        "tables": {
            "customers": {
                "description": "Customer account information",
                "columns": [
                    ("customer_id", "VARCHAR(36)", "PRIMARY KEY", "Unique customer identifier"),
                    ("first_name", "VARCHAR(100)", "", "Customer first name"),
                    ("last_name", "VARCHAR(100)", "", "Customer last name"),
                    ("email", "VARCHAR(255)", "", "Customer email"),
                    ("phone", "VARCHAR(50)", "", "Phone number"),
                    ("address", "VARCHAR(500)", "", "Shipping address"),
                    ("city", "VARCHAR(100)", "", "City"),
                    ("state", "VARCHAR(50)", "", "State/Province"),
                    ("country", "VARCHAR(100)", "", "Country"),
                    ("registration_date", "TIMESTAMP", "", "Account registration date"),
                    ("customer_segment", "VARCHAR(50)", "", "Segment: new, returning, vip"),
                ]
            },
            "products": {
                "description": "Product catalog",
                "columns": [
                    ("product_id", "VARCHAR(36)", "PRIMARY KEY", "Unique product identifier"),
                    ("product_name", "VARCHAR(255)", "", "Product name"),
                    ("category", "VARCHAR(100)", "", "Product category"),
                    ("subcategory", "VARCHAR(100)", "", "Product subcategory"),
                    ("brand", "VARCHAR(100)", "", "Brand name"),
                    ("price", "DECIMAL(10,2)", "", "Unit price in USD"),
                    ("cost", "DECIMAL(10,2)", "", "Unit cost in USD"),
                    ("stock_quantity", "INTEGER", "", "Current stock level"),
                    ("rating", "DECIMAL(2,1)", "", "Average customer rating (0-5)"),
                ]
            },
            "orders": {
                "description": "Customer orders",
                "columns": [
                    ("order_id", "VARCHAR(36)", "PRIMARY KEY", "Unique order identifier"),
                    ("customer_id", "VARCHAR(36)", "FOREIGN KEY → customers", "Customer who placed order"),
                    ("order_date", "TIMESTAMP", "", "Order date and time"),
                    ("status", "VARCHAR(50)", "", "Status: pending, shipped, delivered, cancelled"),
                    ("shipping_method", "VARCHAR(50)", "", "Shipping method selected"),
                    ("shipping_cost", "DECIMAL(10,2)", "", "Shipping cost"),
                    ("tax_amount", "DECIMAL(10,2)", "", "Tax amount"),
                    ("discount_amount", "DECIMAL(10,2)", "", "Discount applied"),
                    ("total_amount", "DECIMAL(12,2)", "", "Total order amount"),
                    ("payment_method", "VARCHAR(50)", "", "Payment method used"),
                ]
            },
            "order_items": {
                "description": "Individual items within orders",
                "columns": [
                    ("item_id", "VARCHAR(36)", "PRIMARY KEY", "Unique item identifier"),
                    ("order_id", "VARCHAR(36)", "FOREIGN KEY → orders", "Parent order"),
                    ("product_id", "VARCHAR(36)", "FOREIGN KEY → products", "Product ordered"),
                    ("quantity", "INTEGER", "", "Quantity ordered"),
                    ("unit_price", "DECIMAL(10,2)", "", "Price per unit at time of order"),
                    ("line_total", "DECIMAL(12,2)", "", "Total for this line item"),
                ]
            }
        },
        "relationships": [
            ("orders", "customer_id", "customers", "customer_id"),
            ("order_items", "order_id", "orders", "order_id"),
            ("order_items", "product_id", "products", "product_id"),
        ]
    }
}


def generate_markdown_schema(schema_def: dict) -> str:
    """Generate markdown documentation for a schema."""
    lines = []
    
    # Header
    lines.append(f"# {schema_def['name']}")
    lines.append("")
    lines.append(schema_def['description'])
    lines.append("")
    
    # Entity Relationship Diagram (ASCII)
    lines.append("## Entity Relationship Diagram")
    lines.append("")
    lines.append("```")
    
    tables = list(schema_def['tables'].keys())
    if len(tables) == 4:
        lines.append(f"┌─────────────────┐       ┌─────────────────┐")
        lines.append(f"│  {tables[0]:<13} │       │  {tables[1]:<13} │")
        lines.append(f"└────────┬────────┘       └────────┬────────┘")
        lines.append(f"         │                         │")
        lines.append(f"         └──────────┬──────────────┘")
        lines.append(f"                    │")
        lines.append(f"         ┌──────────┴──────────┐")
        lines.append(f"         │  {tables[2]:<17} │")
        lines.append(f"         └──────────┬──────────┘")
        lines.append(f"                    │")
        lines.append(f"         ┌──────────┴──────────┐")
        lines.append(f"         │  {tables[3]:<17} │")
        lines.append(f"         └─────────────────────┘")
    
    lines.append("```")
    lines.append("")
    
    # Tables
    lines.append("## Tables")
    lines.append("")
    
    for table_name, table_def in schema_def['tables'].items():
        lines.append(f"### {table_name}")
        lines.append("")
        lines.append(f"_{table_def['description']}_")
        lines.append("")
        lines.append("| Column | Type | Constraint | Description |")
        lines.append("|--------|------|------------|-------------|")
        
        for col in table_def['columns']:
            col_name, col_type, constraint, description = col
            lines.append(f"| `{col_name}` | {col_type} | {constraint} | {description} |")
        
        lines.append("")
    
    # Relationships
    lines.append("## Relationships")
    lines.append("")
    lines.append("| From Table | Column | To Table | Column |")
    lines.append("|------------|--------|----------|--------|")
    
    for rel in schema_def['relationships']:
        from_table, from_col, to_table, to_col = rel
        lines.append(f"| {from_table} | {from_col} | {to_table} | {to_col} |")
    
    lines.append("")
    
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Generate schema documentation")
    parser.add_argument("--config", required=True, help="Path to config JSON file")
    parser.add_argument("--output-dir", required=True, help="Output directory")
    args = parser.parse_args()
    
    # Load config
    with open(args.config, 'r') as f:
        config = json.load(f)
    
    dataset_type = config.get('dataset_type', 'ecommerce')
    
    if dataset_type == 'custom':
        print(f"Custom dataset type: {config.get('custom_description', 'No description')}")
        print("Using e-commerce schema as base template for custom datasets.")
        dataset_type = 'ecommerce'
    
    if dataset_type not in SCHEMAS:
        print(f"Unknown dataset type: {dataset_type}. Using ecommerce.")
        dataset_type = 'ecommerce'
    
    schema_def = SCHEMAS[dataset_type]
    
    # Generate markdown
    markdown = generate_markdown_schema(schema_def)
    
    # Create output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Write schema file
    schema_file = output_dir / "schema.md"
    with open(schema_file, 'w') as f:
        f.write(markdown)
    
    # Also save schema definition as JSON for other scripts
    schema_json = output_dir / "schema.json"
    with open(schema_json, 'w') as f:
        json.dump(schema_def, f, indent=2)
    
    print(f"Schema documentation written to: {schema_file}")
    print(f"Schema definition written to: {schema_json}")
    print("")
    print(markdown)


if __name__ == "__main__":
    main()
