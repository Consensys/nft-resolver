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
}
