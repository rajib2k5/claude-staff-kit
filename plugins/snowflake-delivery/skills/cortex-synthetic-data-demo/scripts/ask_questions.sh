#!/bin/bash
# Interactive script to gather user preferences for synthetic data generation

CONFIG_FILE="./synthetic_data_config.json"

echo "================================================"
echo "   Synthetic Data Generator - Configuration"
echo "================================================"
echo ""

# Question 0: Project Directory Setup
echo "Where would you like to create this demo project?"
echo ""
echo "  Current directory: $(pwd)"
echo ""
PS3="Enter your choice (1-3): "
dir_options=("Create in current directory" "Create a new subdirectory" "Specify a different location")
select dir_opt in "${dir_options[@]}"
do
    case $REPLY in
        1) 
            PROJECT_DIR="$(pwd)"
            break;;
        2) 
            echo ""
            read -p "Enter project name (will create subdirectory): " PROJECT_NAME
            PROJECT_DIR="$(pwd)/$PROJECT_NAME"
            break;;
        3)
            echo ""
            read -p "Enter full path for project: " BASE_PATH
            read -p "Enter project name: " PROJECT_NAME
            PROJECT_DIR="$BASE_PATH/$PROJECT_NAME"
            break;;
        *) echo "Invalid option. Please select 1-3.";;
    esac
done

echo ""
echo "Project will be created at: $PROJECT_DIR"
echo ""

# Question 1: Dataset Type
echo "What type of synthetic dataset would you like to generate?"
echo ""
PS3="Enter your choice (1-5): "
options=("Financial Fraud Detection" "Logistics & Shipping" "Healthcare Records" "E-commerce Transactions" "Custom (describe your own)")
select opt in "${options[@]}"
do
    case $REPLY in
        1) DATASET_TYPE="financial_fraud"; break;;
        2) DATASET_TYPE="logistics"; break;;
        3) DATASET_TYPE="healthcare"; break;;
        4) DATASET_TYPE="ecommerce"; break;;
        5) 
            echo ""
            read -p "Describe your custom dataset type: " CUSTOM_DESCRIPTION
            DATASET_TYPE="custom"
            break;;
        *) echo "Invalid option. Please select 1-5.";;
    esac
done

echo ""
echo "Selected: $opt"
echo ""

# Question 2: Number of Records
echo "How many records should be generated for the primary table?"
echo ""
PS3="Enter your choice (1-4): "
record_options=("1,000 (Quick demo)" "10,000 (Standard demo)" "100,000 (Large dataset)" "Custom amount")
select rec_opt in "${record_options[@]}"
do
    case $REPLY in
        1) NUM_RECORDS=1000; break;;
        2) NUM_RECORDS=10000; break;;
        3) NUM_RECORDS=100000; break;;
        4)
            echo ""
            read -p "Enter custom number of records: " NUM_RECORDS
            # Validate numeric input
            if ! [[ "$NUM_RECORDS" =~ ^[0-9]+$ ]]; then
                echo "Invalid number. Using default 10000."
                NUM_RECORDS=10000
            fi
            break;;
        *) echo "Invalid option. Please select 1-4.";;
    esac
done

echo ""
echo "Selected: $NUM_RECORDS records"
echo ""

# Question 3: Snowflake Target
# Default database/schema to project name if available
if [ -n "$PROJECT_NAME" ]; then
    DEFAULT_DB=$(echo "$PROJECT_NAME" | tr '[:lower:]' '[:upper:]' | tr ' -' '_')
    DEFAULT_SCHEMA="$DEFAULT_DB"
else
    DEFAULT_DB="DEMO_DB"
    DEFAULT_SCHEMA="PUBLIC"
fi

read -p "Enter Snowflake database name [default: $DEFAULT_DB]: " SF_DATABASE
SF_DATABASE=${SF_DATABASE:-"$DEFAULT_DB"}

read -p "Enter Snowflake schema name [default: $DEFAULT_SCHEMA]: " SF_SCHEMA
SF_SCHEMA=${SF_SCHEMA:-"$DEFAULT_SCHEMA"}

read -p "Enter Snowflake warehouse [default: COMPUTE_WH]: " SF_WAREHOUSE
SF_WAREHOUSE=${SF_WAREHOUSE:-"COMPUTE_WH"}

echo ""
echo "================================================"
echo "   Configuration Summary"
echo "================================================"
echo ""
echo "  Project Directory:  $PROJECT_DIR"
echo "  Dataset Type:       $DATASET_TYPE"
if [ "$DATASET_TYPE" = "custom" ]; then
    echo "  Custom Desc:        $CUSTOM_DESCRIPTION"
fi
echo "  Number of Records:  $NUM_RECORDS"
echo "  Snowflake Database: $SF_DATABASE"
echo "  Snowflake Schema:   $SF_SCHEMA"
echo "  Snowflake Warehouse: $SF_WAREHOUSE"
echo ""
echo "================================================"

# Confirm before saving
read -p "Save this configuration? (y/n): " CONFIRM
if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
    # Create JSON config file
    if [ "$DATASET_TYPE" = "custom" ]; then
        cat > "$CONFIG_FILE" << EOF
{
    "dataset_type": "$DATASET_TYPE",
    "custom_description": "$CUSTOM_DESCRIPTION",
    "num_records": $NUM_RECORDS,
    "output_dir": "$PROJECT_DIR",
    "snowflake": {
        "database": "$SF_DATABASE",
        "schema": "$SF_SCHEMA",
        "warehouse": "$SF_WAREHOUSE"
    }
}
EOF
    else
        cat > "$CONFIG_FILE" << EOF
{
    "dataset_type": "$DATASET_TYPE",
    "num_records": $NUM_RECORDS,
    "output_dir": "$PROJECT_DIR",
    "snowflake": {
        "database": "$SF_DATABASE",
        "schema": "$SF_SCHEMA",
        "warehouse": "$SF_WAREHOUSE"
    }
}
EOF
    fi
    
    echo ""
    echo "Configuration saved to: $CONFIG_FILE"
    echo ""
    cat "$CONFIG_FILE"
else
    echo "Configuration not saved. Please run again."
    exit 1
fi
