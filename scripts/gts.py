import argparse
import json
from datetime import datetime, timedelta

def parse_js_arrays(input_file: str):
    """Parses the JavaScript arrays for dates and values from the input file."""
    with open(input_file, 'r') as file:
        content = file.read()

    # Use regular expressions to extract arrays
    import re
    dates_match = re.search(r"const dates = \[(.*?)\];", content, re.DOTALL)
    values_match = re.search(r"const values = \[(.*?)\];", content, re.DOTALL)

    if not dates_match or not values_match:
        raise ValueError("Input file must contain valid 'dates' and 'values' arrays.")

    # Extract and parse the arrays
    dates_str = dates_match.group(1).strip()
    values_str = values_match.group(1).strip()

    # Correctly handle string quotes in dates
    dates = json.loads("[" + dates_str.replace("'", '"') + "]")
    values = json.loads("[" + values_str + "]")

    return dates, values

def calculate_gts(dates, values):
    """Calculates the GTS based on the given rules."""
    if len(dates) != len(values):
        raise ValueError("The dates and values arrays must have the same length.")

    cumulative_sum = 0
    results = []

    for i in range(len(values)):
        val = max(0, values[i])  # Replace negative values with 0.0
        current_date = datetime.strptime(dates[i], "%Y-%m-%d")
        month = current_date.month

        # Apply weights based on the month
        if month == 1:
            val *= 0.5
        elif month == 2:
            val *= 0.75

        # Update cumulative sum and round
        cumulative_sum = cumulative_sum + val

        # Append the cumulative sum for the current date
        results.append({
            "date": dates[i],
            "gts": round(cumulative_sum, 2)
        })

    return results

def write_output(output_file: str, results):
    """Writes the results to the output file in the specified format."""
    with open(output_file, 'w') as file:
        file.write("        expect(result).toEqual([\n")
        for i, result in enumerate(results):
            if i == 0:
                file.write(f"            // 0 + ({results[i]['gts']:.1f} * 0.5) = {results[i]['gts']}\n")
            else:
                prev_gts = results[i - 1]['gts']
                value = results[i]['gts'] - prev_gts
                month = datetime.strptime(results[i]['date'], "%Y-%m-%d").month
                if month == 1:
                    weight = 0.5
                elif month == 2:
                    weight = 0.75
                else:
                    weight = 1.0
                if value > 0:
                    file.write(f"            // {prev_gts} + ({value / weight:.1f} * {weight}) = {results[i]['gts']}\n")
                else:
                    file.write(f"            // {prev_gts} + (0 * {weight}) = {results[i]['gts']}\n")
            file.write(f"            {{ date: '{result['date']}', gts: {result['gts']} }},\n")
        file.write("        ]);\n")

def main():
    parser = argparse.ArgumentParser(description="Compute GTS values from input data.")
    parser.add_argument('-i', '--input', required=True, help="Path to the input file containing JavaScript arrays.")
    parser.add_argument('-o', '--output', required=True, help="Path to the output file for GTS results.")

    args = parser.parse_args()

    try:
        dates, values = parse_js_arrays(args.input)
        results = calculate_gts(dates, values)
        write_output(args.output, results)
        print(f"GTS calculation completed successfully. Results saved to {args.output}.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
