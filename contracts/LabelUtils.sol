// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.25;

/**
 * @title Library to perform ENS label manipulation
 * @author ConsenSys Software Inc.
 */
library LabelUtils {
    /**
     * Extract the first label name from a dns encoded ens domain
     * @param name the dns encoded ENS domain
     * @return label as bytes
     */
    function extractFirstLabel(
        bytes memory name
    ) external pure returns (bytes memory) {
        uint256 idx = 0;
        uint8 labelLength = uint8(name[idx]);
        idx++;
        bytes memory label = new bytes(labelLength);
        for (uint256 i = 0; i < labelLength; i++) {
            label[i] = name[idx + i];
        }
        return label;
    }

    /**
     * Extract the numeric suffix from the dns encoded label
     * @param label the dns encoded label
     * @return number the numeric suffix
     */
    function extractNumericSuffix(
        bytes memory label
    ) external pure returns (uint256) {
        uint256 num = 0;
        bool hasNumber = false;

        for (uint256 i = 0; i < label.length; i++) {
            uint8 char = uint8(label[i]);
            if (char >= 48 && char <= 57) {
                // ASCII for '0' is 48 and '9' is 57
                num = num * 10 + (char - 48);
                hasNumber = true;
            } else if (hasNumber) {
                // Break on first non-digit after starting to read numbers
                break;
            }
        }

        require(hasNumber, "No numeric suffix found");
        return num;
    }

    /**
     * Check if the bytes param is a number or not
     * @param input bytes to check
     * @return true if number, false otherwise
     */
    function isNumber(bytes memory input) public pure returns (bool) {
        for (uint i = 0; i < input.length; i++) {
            // Check if each byte is within the ASCII range for '0' to '9'
            if (input[i] < 0x30 || input[i] > 0x39) {
                return false;
            }
        }
        return true;
    }

    /**
     * Counts the number of labels in the DNS encoded input given
     * @param input the DNS encoded input to count from
     * @return number labels found
     */
    function countLabels(bytes memory input) public pure returns (uint) {
        uint count = 0;
        uint i = 0;

        while (i < input.length) {
            uint labelLength = uint(uint8(input[i]));
            if (labelLength == 0) {
                break; // End of the DNS name
            }
            count++;
            i += labelLength + 1;
        }

        return count;
    }
}
